# ADR-0008 — The smallest replaceable piece of a provider

- **Status:** accepted
- **Date:** 2026-08-05
- **Decision context:** The first production adoption ended with three shipped providers replaced
  by custom ports, and drew a general conclusion from it: "a single missing method or field forces
  a host to fork the entire provider, losing every other correct behaviour in it." The conclusion
  is worth answering even though the example offered for it does not hold. This record fixes what a
  host replaces when it disagrees with one detail, where that stops working, and why the unit is
  not going to get smaller.

## The claim, separated from its example

The example was `identify` on the Meta browser provider, omitted on the grounds that Meta honours
advanced matching only in the `fbq('init')` base code, which belongs to the host. The report
argued that `fbq('setUserID', …)` is a real Pixel API that the omission drops.

**It is not.** No command by that name appears in Meta's Pixel reference or on its advanced
matching page, and that page's own sentence is the one the provider's TSDoc already quotes:
parameters not placed in the base code are not treated as manual advanced matching. The name comes
from `FB.AppEvents.setUserID`, part of the JavaScript App Events API that served Facebook
Analytics; the product was retired in June 2021 and that web API was supported until July 2022.
Neither is a Pixel command. Adding `identify` there would mean shipping an API that looks like
identity and performs none, which is the objection that already rejected `trackSingle`. That part
of the report is closed.

The general claim survives its example, and it is a fair question: a provider is one object, so
what does a host do when it agrees with all of it but one line?

## The unit is the provider, and it is already smaller than a fork

A provider is a plain object. `ga4()`, `meta()` and `posthog()` return object literals with `name`,
`default`, an optional `events` map, and functions. Nothing about them is closed. A host that
disagrees with one detail wraps the shipped provider and delegates the rest:

```ts
const base = posthog({ apiKey });

const patched: ServerProvider = {
  ...base,
  async track(name, data, context, report) {
    const user = context.user ?? (await myOwnLookup(context));
    await base.track(name, data, { ...context, user }, report);
  },
};
```

That is a handful of lines, not a port. Every other behaviour in the shipped provider — the cookie
decode with its percent-encoding, the `$set` placement for person properties, the ISO timestamp,
the host URL handling, the error text that names the vendor's own field — is kept, and keeps being
maintained here.

On the browser half, the optional members make it smaller still. `identify` and `consent` are
optional on `BrowserProvider`, so a host that wants Meta identity in its base code keeps the
shipped `meta()` untouched and writes that line in its own snippet, which is exactly what Meta
documents and exactly what the governing test produces. Nothing is forked at all.

**The trap this pattern makes easy, and the documentation must name.** A wrap that injects
*stored* identifiers is the supported shape; a wrap that fabricates them is what ADR-0007 refuses,
and wrapping does not launder it. The GA4 case is where this bites: patching `context.cookies` with
a made-up `_ga` produces a `204` and, by ADR-0007's own evidence, nothing in any report. The
delegation page carries ADR-0007's persist-and-reinject recipe or it teaches the defect this record
exists to prevent.

## Where delegation stops, which is the honest limit

Delegation reaches what a provider reads: the context, the data, the event name, the bindings.
**It does not reach a field the adapter builds inside `track` and does not expose.** The report's
PostHog request is exactly that case: adding `uuid` to the capture body cannot be done by wrapping,
because the body is assembled and sent in one closed method. A host that wants it must re-copy the
whole send.

So the report's three ports do not share a diagnosis, and grouping them was the part that
overreached:

- **Meta `identify`** — nothing to fork, because nothing was missing. The API it names does not
  exist, and identity belongs in the host's base code.
- **GA4 and PostHog missing identity** — a wrap or a call-site change, five lines, once the recipe
  is written down. A documentation failure on our side, not a structural one.
- **PostHog `dedupId`** — a genuine consequence. No wrap fixes it. That one is the shipped provider
  being wrong, and it is decided on its own terms in ADR-0009.

That boundary is the useful output of this record: **disagreement with what a provider reads is a
wrap; disagreement with what it sends is a bug.** The second is filed here, not worked around.

## Considered and rejected

**A hook on the payload — `transform`, `beforeSend`, or middleware.** This is per-call
customisation with a different name, which ADR-0003 rejected.

The argument has to be made carefully, because a wrap can rewrite a payload too and the objection
cannot be "host code touches the payload" without also condemning what this record blesses. The
difference is ownership and permanence. A hook is library surface: offered to every host, present
in every send path, documented, versioned, and ours to keep working. A wrap is host code the
library never sees and makes no promise about, carrying the same freedom and the same
responsibility as calling the vendor's SDK by hand. ADR-0005 left per-provider payload projection
unsolved and pointed at that same freedom as the answer; documenting delegation names the freedom
without turning it into a feature. **It is not an endorsement of payload projection**, and the
delegation page should say so: what leaves the shipped providers is what the vendor documents, and
a host that changes that owns the result.

**Per-field configuration on each factory, so the disagreement becomes an option.** Every option is
a permanent commitment to a shape, argued once and maintained forever, added in response to a
single adopter. Delegation costs the host five lines and costs the library nothing.

**A documented base class or `extendProvider` helper.** Object spread already is the helper. A
named export would suggest an inheritance contract we do not have and would have to keep.

## What this decides

The replaceable unit is the provider object, and the supported way to disagree with part of one is
to wrap it and delegate. This gets documented, with the shape above, the boundary, and the trap, on
the provider pages and in the "writing a provider" page.

Two consequences we accept:

A wrapped provider is outside the conformance suite. A host that wraps can break an invariant the
suite protects — inventing an identifier, widening a consent denial — and nothing here will catch
it. That is the same freedom a hand-written vendor call has, and the same responsibility.

A disagreement that many hosts share is a bug in the provider, not an occasion to wrap. Delegation
is the escape hatch for one host's situation. If two report the same wrap, the shipped provider is
wrong and gets fixed.

## What this does not settle

Whether `EventContext` should carry vendor-specific identity at all. ADR-0007 answers the case that
prompted the question with the existing `cookies` map and does not close the wider one; delegation
is not a reason to close it either way.
