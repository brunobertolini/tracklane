# ADR-0011 — Linking two identities is one operation, not a side effect of every event

- **Status:** accepted
- **Date:** 2026-08-05
- **Decision context:** The same adopter's follow-up named the one thing still keeping its PostHog
  server port alive, and it had not been in the first report: after capturing an event,
  their port sends a second capture that merges the browser's anonymous person into the
  identified one. They ask for it upstream, on the grounds that ADR-0008 puts "what a provider
  sends" on our side. The pain is real and the mechanism is real. The shape is wrong, and the
  evidence offered for it is structurally unable to show why.

## What was asked for

After each `track`, when the anonymous id in the `ph_<key>_posthog` cookie differs from the
resolved `userId`, emit:

```
event: '$identify'
distinct_id: <userId>
properties: { $anon_distinct_id: <anonymous id> }
```

Without something like it, a server conversion for a signed-in visitor lands on the `userId`
person while the anonymous session that produced the sale stays separate, so the campaign and the
revenue attach to different people. That failure is genuine, PostHog names it in its own identity
documentation, and it is not answered by anything we ship.

The mechanism is genuine too. That body does trigger a person merge on PostHog's ingestion path.
This record does not dispute either half.

## Why not inside `track`

**The vendor documents a different verb, used a different number of times.** PostHog's guidance for
backends is that they have no concept of an anonymous session and so have nothing to merge, and
that linking two known ids from a server is `alias`, performed once when both are first known. Our
governing test lands in the same place: a hand-written integration calls it at login and then
captures purchases under the user id alone. It does not re-merge on every purchase. Our own
`posthog.browser` already calls `identify` once, for the same reason.

**The failure mode is invisible, which is the class of defect this project exists to avoid.** A
merge is refused when the anonymous id has already been claimed by another identified person, and
the refusal never reaches the HTTP response — it surfaces as an ingestion warning in the vendor's
own interface. On a shared device, a stale cookie, or a mis-forwarded `Cookie` header, the library
would be performing an irreversible join, per call, and reporting success every time. Merges cannot
be undone except by hand.

**It spends the host's money without asking.** Identified events carry person processing, which
PostHog prices well above anonymous capture. One extra identified event per conversion is a billing
decision, and it is not ours to take on the host's behalf.

**The evidence offered cannot see any of this.** The adopter reports a 100% join rate in
production. The provider resolves `distinct_id` from `userId` first, so the conversion already
attaches to the identified person with no merge at all; a join measured that way does not
distinguish a merge that happened from one that was refused. And the two cases the request is
justified by — an ad blocker, a denied consent — are cases where the vendor's own tag never ran and
therefore wrote no cookie, so the merge has nothing to read. The mechanism only reaches the middle
case: the tag ran and `identify` did not.

## Why not `identify` on `ServerProvider` either

The server half has no retained identity by design: identity travels per call, and `ServerTracking`
exposes only `track`. Adding `identify` there to serve one vendor is the umbrella concept the
project has refused since ADR-0003 — a method every provider must consider and only one implements,
whose meaning would then be negotiated vendor by vendor. Most of the five have no server-side merge
verb at all.

## The decision

**Linking happens once, at the moment both identities are known, and it belongs to the host.** The
documentation gains a section for it: when the browser may not have run `identify`, send one
`alias` (or one `$identify` with `$anon_distinct_id`) from the server at that moment, then track
under the user id. It is the same shape as ADR-0007's persist-and-reinject: the host stores what
the browser knew and uses it once, deliberately, rather than having the library infer it
repeatedly.

A host that wants the call inside its dispatch can wrap the provider, per ADR-0008. That is a few
lines against a full port, which is the difference this record actually buys the adopter.

**Condition for reopening:** a second host reporting the same wrap. That is ADR-0008's own rule —
a disagreement two hosts share is a bug here — and it applies to the *once* affordance, never to a
second capture on every `track`.

## A correction to ADR-0008's boundary

The adopter applied ADR-0008 correctly as written and reached the wrong answer, which means the
sentence was too short. "Disagreement with what a provider reads is a wrap; disagreement with what
it sends is a bug" covers a field of the event we already send, which is why `uuid` was ours in
ADR-0009. **A second operation is neither.** It is a verb the contract does not have, and that is a
question about the contract rather than about a payload. The documentation page owed by ADR-0008
carries all three cases, not two.

## Also rejected, from the same report

**A `report()` when a provider that documents a dedup field receives no `dedupId`.** It was
proposed after the adopter found its own `dedupId` arriving `undefined` at every call site, a real
bug that this diagnostic would have caught.

`report` is for a caveat about a request that already succeeded. An absent optional input is not
that, and four of the five vendors document a dedup field, so a host that legitimately does not
deduplicate would collect several warnings per event and learn to ignore the channel — the same
erosion ADR-0007 warns about from the other direction. ADR-0009 already takes the adjacent case
that is a genuine caveat: a `dedupId` that arrived and could not be forwarded.

The class of bug is real and worth naming in the documentation instead: the value exists somewhere
in the host's checkout and does not reach the call. What catches it is the captured request that
ADR-0004 already demands before a provider is trusted.
