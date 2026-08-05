# ADR-0007 — Identity is never invented, not even to save a conversion

- **Status:** accepted
- **Date:** 2026-08-05
- **Decision context:** The first production adoption reported that `ga4.server` and
  `posthog.server` throw when the request carries no vendor cookie, and asked for a fallback that
  generates an identifier so the conversion is recorded anyway. The request is reasonable on its
  face and the trade it proposes is real. This record says no, states the evidence that decides it
  rather than the principle that would have decided it anyway, and writes down the path that does
  work, because refusing without naming that path is how the next adopter forks the provider too.

## What was asked for

A server conversion API exists to record what the browser could not. Throwing on a missing
*browser* cookie inverts that: the harder the browser environment, the more likely the sale is
dropped. The triggers named are ordinary — ad blockers, in-app webviews that lose cookies,
EEA visitors whose host legitimately never forwards `_ga`, a webhook firing long after the
session ended.

The Measurement Protocol does accept an arbitrary `client_id`; it need not come from a `_ga`
cookie. So the proposal was: generate one, `report()` the caveat, and let revenue with unknown
attribution beat revenue not recorded.

**The pain underneath it is sharper than the report states, and worth naming plainly.** GA4 throws
even when the host knows exactly who bought. The Measurement Protocol requires `client_id` and
`user_id` does not substitute for it, so a payment webhook holding a signed-in customer still
cannot send. That case is not an ad blocker edge; it is the ordinary shape of server-side
commerce, and it deserves an answer rather than a principle.

## Why the generated fallback is refused

**It does not do what it claims.** Under ordinary tag behaviour `_ga` and `_ga_<container>` are
written by the same Google tag, and in every trigger the report names they are absent together.
Inventing `client_id` therefore leaves the event with no `session_id`.

This repository verified against its live property, on 2026-07-31, that an event with no
`session_id` is accepted by the collection endpoint and appears in no report there. That finding is
why `ga4.server` calls `report()` for a missing session today. Google's own current wording is
softer — such events may still surface in some reports while contributing nothing to engagement or
Realtime — so treat this as **this project's empirical gate rather than a universal guarantee from
Google**. It is enough to decide the question either way: the fallback produces a `204`, a
satisfied `report()` callback, and no usable measurement.

That is a silent success. This project has a name for that class of defect and an ADR-0004 gate
built to catch it; shipping one deliberately is not available to us.

Making the fallback honest would mean generating a `session_id` as well, which is a second invented
identifier. Then the event does appear — as a new user, unattributed, one per send. Where no
`user_id` is present, GA4's reporting identity falls through to `client_id`, so a fresh one per
cookieless request inflates user counts and dilutes every per-user metric in the property. That is
exactly the population this fallback would apply to. The report frames the trade as "unknown
attribution versus no record". The actual trade is "one clean gap versus a permanently distorted
user count".

**PostHog throws in a narrower case than the report suggests.** `posthog.server` resolves
`distinct_id` from `context.user.userId` first and only falls back to the cookie. A payment webhook
knows who bought — that is what a payment is. Passing `user.userId` is the hand-written answer and
it never throws. The throw fires only when nobody knows who the visitor is, and an invented
`distinct_id` there creates one orphan person per event: PostHog accepts it, connects it to
nothing, and the person count climbs.

**And it reopens a settled item.** `AGENTS.md`: the library never invents an identifier, not the
deduplication id, not a client id. The evidence above is what decides this record; the settled item
is what it confirms. Note that `src/conformance.ts` does not fully mechanise that rule — it asserts
that the same call twice produces the same thing, which catches a *random* invented id and would
pass a deterministic one. The rule is doctrine with a partial check under it, not a check.

## What works, and it works today

Persist the visitor's own identifiers while the browser still has them, and hand them back to the
server call later:

```ts
// The container suffix is the measurement id without its `G-`, which is what the tag
// writes and what `ga4.server` reads. It is not the numeric Stream ID the GA4 admin shows.
const container = measurementId.replace(/^G-/, '');

// In the browser, at the moment the session exists — checkout start, sign-in, add to cart.
saveWithTheOrder({ ga: cookies._ga, gaSession: cookies[`_ga_${container}`] });

// In the webhook, hours later, with no browser in sight.
await track('purchase', order, {
  cookies: { _ga: order.ga, [`_ga_${container}`]: order.gaSession },
  user: { userId: order.userId },
});
```

This is the only shape that lands in a report, because it carries the session as well as the
visitor. It needs nothing new: ADR-0003 already has `cookies` accepting a parsed map precisely so a
host can write `{ _ga: storedValue }` under the name the vendor uses.

Two details decide whether it works, and both are silent when wrong. The value must be the cookie
as the browser wrote it (`GA1.<depth>.<a>.<b>`), not a bare client id — `ga4.server` parses the
cookie shape and a stripped value fails the same way a missing one does. And the session cookie's
suffix is the measurement id with `G-` removed, which is a different thing from the Stream ID in
the GA4 interface; storing the wrong one persists `undefined` and produces exactly the invisible
event this record exists to prevent.

**The surface is adequate; the documentation is not.** This pattern appears nowhere on the site,
which is why an adopter reached for invention instead. That gap is the real defect this report
exposed, and it is what changes here.

A host that has no stored cookies and still wants the event to exist supplies its own stable value
in the same channel. It owns the value, its stability across retries, and the consequences for its
own reports — and it should know that a stable `client_id` without a session inherits the same
invisibility proven above. The library forwarding a host's value is not the library inventing one.
Nothing here forbids it, and it is not a new surface: it is the same `cookies` map.

## Considered and rejected

**An opt-in lever, `ga4({ onMissingClientId: 'generate' })`.** It reads as a compromise and is not
one. The library still invents the identifier; the host only chooses when. It also fails the
governing test — a host writing this by hand does not write a branch that fabricates a Google
identifier, it reinjects what it stored or accepts the gap.

**Sending without `client_id` and letting Google decide.** The protocol requires the field. The
endpoint would accept the payload and drop the event, which is the same silent success in a
cheaper wrapper.

**Downgrading the throw to a `report()` so it reads as a warning.** This would change less than it
appears: both reach the same `onError` channel and `track()` rejects in neither case, so only the
severity label moves. It is rejected because the label would be wrong — a warning is for a request
that succeeded with a caveat, and here nothing was sent.

**PostHog's `$process_person_profile: false`.** The vendor documents anonymous backend events, so
"a server event with no person" is a first-class concept there rather than an aberration. It does
not rescue the proposal: the library would still have to invent the `distinct_id` that accompanies
it, and it would change what the host's PostHog project counts as a person without the host asking.
A host that wants anonymous capture wants it for reasons the library cannot see. If this is asked
for on its own terms, it is a lever on the `posthog()` factory and a separate argument.

## What actually changes

No code. Two documentation debts, both owed to the server pages:

The persist-and-reinject recipe above, including the cookie shape requirement and the warning that
supplying a client id without a session is not the same as the conversion appearing.

`onError` is optional, and its TSDoc says the library is silent without it "exactly as a
hand-written vendor call is". That is deliberate and consistent. It is also, on the server, a
loaded gun: a host that omits `onError` and relies on `ga4.server` for conversions loses every
cookieless one and learns nothing. The documentation should say plainly that `onError` is optional
in the type and not optional in practice.

## What this does not settle

**When a provider throws, reports, or omits, as a pattern.** Three server providers already refuse
on missing identity — `ga4` on `client_id`, `posthog` on `distinct_id`, `meta` when it can build no
`user_data` at all — while `ga4` merely reports a missing session. That is enough repetition to
deserve one short record instead of three comments, and the next adopter will ask why the same
vendor is loud about one identifier and soft about another. It is owed now, not once a third vendor
arrives.
