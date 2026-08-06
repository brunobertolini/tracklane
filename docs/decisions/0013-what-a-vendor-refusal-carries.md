# ADR-0013 — What a vendor refusal carries

- **Status:** accepted
- **Date:** 2026-08-06
- **Decision context:** ADR-0012 settled *when* an adapter throws and when it reports. It said
  nothing about what the throw carries, and the first production adoption found out why that
  matters: Meta refused every purchase with a 400, and the only thing that reached the host was
  `meta: the Conversions API answered 400`. The Graph API had explained the reason in the response
  body, and the adapter had read it never and discarded it always.

## The shape all three providers shared

```ts
if (!response.ok) {
  // The status only. The event carries raw personal data, and no
  // library-owned surface re-emits it into a host's logs.
  throw new Error(`meta: the Conversions API answered ${response.status}`);
}
```

Identical in `ga4.server.ts`, `meta.server.ts` and `posthog.server.ts`, comment included. So this
is a contract question, not a Meta patch: LinkedIn and X would each have arrived at the same line.

The diagnosis it produces is "it failed", and the host has nowhere to go from there. The vendor
said why, in the one place the library threw away.

## The decision

**A refusal carries the vendor's own answer. The message stays free of it.**

Two surfaces, and the distinction between them is the whole decision:

- **`message`** is what a reporter prints and fingerprints on. It keeps the guarantee that
  `TrackingError` already documents: event data never appears here.
- **`cause`** is inert. Nothing reaches a log through it unless the host writes `onError`, reads
  the field, and chooses to. That is the same act it would perform by hand.

So the adapters throw a typed error instead of a bare one:

```ts
export class VendorResponseError extends Error {
  readonly provider: string;
  readonly status: number;
  readonly body: string; // verbatim from the vendor, capped
}
```

The provider supplies its own message; the class only carries data. The library decides nothing
about what the host logs.

The cap is **2048 characters**, applied in the constructor so every provider inherits it rather
than repeating it, and the `…[truncated]` suffix fits inside that number rather than being
appended past it. The value is a round one, not a derived one: a Graph error is a few hundred
bytes, and anything far above that is an error page from something between you and the vendor,
which the first 2048 characters identify perfectly well.

### Why this does not break the governing rule

The test that decides cases — *"if I did not have the library, how would I write this line by
hand?"* — answers what the vendor receives: the payload, the timing, the protocol (ADR-0002). It
does not govern how a failure is reported, and reaching for it here argues the body belongs in the
message, which is wrong for a reason the next section gives.

The authority for this question is the documented contract of `TrackingError`, and it constrains
`message` alone: *"What happened, in one line, excluding the payload: event data never appears
here."* That guarantee survives intact. What is formally loosened is narrower and is stated here so
nobody has to infer it: **a Graph error body can quote the parameter it refused, so `cause.body` may
contain event data.** It is the vendor's words about the request, delivered to the host that asked
for them.

Two defaults keep that inert. `makeReporter` returns a no-op when no `onError` is given. And
Sentry's `captureException` erases every property but `message` and `stack` unless the host adds
`extraErrorDataIntegration` — which is also why `body` is a property and not a nested
`{ cause: new Error(body) }`: the default `linkedErrorsIntegration` *does* follow `cause`, and that
form would ship the body to an APM nobody asked to send it to.

### Where the class lives, and what that costs

The root entry is where a provider written outside this package imports from, and
`providers/boundary.test.ts` holds it to that. So the class is exported from the root — which
**ends the root being types-only**, a property its own `@packageDocumentation` announced. That is
amended deliberately rather than as a side effect. A class declaration is not a side effect under
`sideEffects: false`, and a consumer of `tracklane/browser` still pulls in nothing.

`tracklane/server` was the alternative and creates a runtime cycle: it re-exports the providers, and
the providers would import it back.

`instanceof` is not the check. Two copies of the package in one `node_modules`, or two entries that
each inlined the class, produce two constructors and one silent `false`. `isVendorResponseError`
tests a `Symbol.for` brand, which crosses both.

## What is not decided here, and belongs to the host

**Splitting one Sentry issue into several.** The first draft of this change put the vendor's error
code in the message for exactly that, and the premise is false: Sentry's grouping is fingerprint,
then stack trace, then exception, then message, and *"when Sentry detects a stack trace in the event
data, the grouping is effectively based entirely on the stack trace"*. Every refusal in a provider
throws from one line, so the stacks are identical and the message never gets a vote. The proof was
already in the tree: `answered 400` and `answered 500` differ in message today and would already be
separate issues if the message decided.

What splits them is a fingerprint the host sets from `cause.status` and whatever code it parses out
of `cause.body`. That is the host's grouping policy, not the library's, and it is a documentation
page rather than a line of library code. The parse stays out of the throw path.

## Considered and rejected

**The body in the message.** It is what the line looks like written by hand, and it is worse in
both directions: the guarantee `TrackingError` documents is gone, and a body carrying `fbtrace_id`
opens one issue per event in any host whose grouping does reach the message.

**Filtering the body to an allow-list of fields per vendor.** The library would be deciding what the
host may know, per vendor, forever, and would be wrong the first time a vendor added a field. The
cap is a size, not a judgement about content.

**A plain object, or `new Error(msg, { cause })`.** Neither gives conformance something to assert or
an outside provider something to import, and the `cause` form is the one that leaks by default
through `linkedErrorsIntegration`.

**Extending `TrackingError` with `status` and `body`.** It would teach the core that a provider is
an HTTP client. Three of five are; the contract does not say so and should not start.

## Consequences for a provider

Conformance gains one assertion, and only on the transport failure: a provider that gets a refusal
from its vendor throws something the guard recognises, carrying the status and the body. This is
inherited by LinkedIn and X rather than argued again.

**Preconditions stay bare throws.** GA4 with no `client_id`, PostHog with no resolvable
`distinct_id`, Meta with no `user_data` — there is no response to carry, and ADR-0012 already covers
why they throw at all. The new type is a subtype of one case, not a reclassification of the rule.
