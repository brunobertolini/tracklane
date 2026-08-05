# ADR-0009 — PostHog deduplication, and what its acceptance criterion has to be

- **Status:** accepted
- **Date:** 2026-08-05
- **Decision context:** The first production adoption's highest-priority finding: `posthog.server`
  receives `context.dedupId` and drops it, so a retried webhook writes a second `purchase` and
  inflates revenue. The finding is correct and the provider's own comment about it is wrong. The
  fix that follows from the report as written would break more than it repairs, which is why this
  needs a record rather than a patch. ADR-0008 names this as the one case its escape hatch cannot
  reach.

## What the provider says, and what is true

`posthog.server` sends no dedup field, and comments that the Capture API "documents no
deduplication key at all — not even one under a vendor-specific name". That claim is false and
should be deleted rather than softened.

PostHog documents that events sharing the same `uuid`, `event` name, `timestamp` and `distinct_id`
are treated as duplicates. Its Node and Python SDKs expose `uuid` on capture for exactly this, and
its own guidance for idempotent ingestion is to send the same `uuid` twice.

Three properties of that mechanism decide this record, and none of them appear in the report:

**Deduplication is on the whole quartet, not on `uuid` alone**, and the timestamp's role is
murkier than the documentation admits. `posthog.server` stamps
`new Date(context.timestamp).toISOString()`, and `context.timestamp` falls back to `Date.now()` per
call, so a retry carries the same `dedupId` and a different timestamp. Whether that defeats the
match depends on which contract is true: the documented one names the timestamp, while the
deployed table orders by `(team_id, toDate(timestamp), event, cityHash64(distinct_id),
cityHash64(uuid))` — the date, not the instant — which would collapse a same-day retry and let a
retry across midnight through. PostHog's own handbook calls that schema choice a mistake, so it is
not something to design against.

We design against the documented contract and tell hosts to pin `timestamp` to a value derived from
the order rather than from the clock. It is correct under both readings and costs nothing. What
does not survive either reading is the report's acceptance criterion — two `track()` calls with the
same `dedupId` produce one event — as something that holds automatically once the field exists.

**Deduplication is eventual.** It happens during background ClickHouse merges, so both rows are
visible for a while. A test that sends twice and immediately counts one will fail, and a host
watching its dashboard during an incident will see the duplicate.

**The field must hold a UUID, and a bad one is unsafe rather than ignored.** PostHog's ingestion
warnings document dropping events with invalid UUIDs, and a reported case sending `uuid: '50172'`
received HTTP 400 instead, with the same payload succeeding once the field was removed. The failure
mode varies; both ends of it are worse than the double-count. This is what turns the obvious fix
into a regression: `dedupId` is a host-chosen string, and the library's own TSDoc example is
`dedupId: order.id`, because Meta's `event_id` accepts anything. A host following our example who
upgrades into a straight `uuid: context.dedupId` mapping either sends nothing or has its events
dropped on arrival. One duplicated purchase would become zero purchases.

## The decision

**Map `dedupId` to `uuid` when the value is a UUID, and `report()` when it is not.**

The value stays the host's. Nothing is generated, nothing is derived, and a host that already uses
UUIDs for its event ids — which the webhook case tends to, since that is what payment providers
hand out — gets the deduplication it asked for with no change on its side. A host using an order
number gets a diagnostic that says the id was not forwarded and why, which is a caveat about a
request that succeeded, exactly what `report` is for.

What "is a UUID" means is left to the implementation and has to be decided there rather than
assumed: a loose check that lets a payment reference through reintroduces the regression, and a
strict v4-only check rejects the v7 ids modern systems hand out.

The browser half is a separate change. `posthog.browser` records that `capture()` accepts no dedup
key from its options, which was true when it was written; the request to expose one on
`CaptureOptions` has since been closed upstream, and whether the installed `posthog-js` offers it
publicly is a fact to check at implementation time rather than assume in either direction. It gets
its own verification either way.

## Considered and rejected

**Deriving a UUIDv5 from `dedupId` so every host benefits.** It works, and it is the library
inventing an identifier: a value the host never chose, cannot predict, and cannot query PostHog by,
whose stability depends forever on a namespace constant picked here. It would also pass
`conformance.ts`, which checks that two identical calls produce the same payload — a deterministic
invention is precisely the case the check does not cover and doctrine has to, which is worth
noticing while writing it down rather than after.

**Sending `dedupId` as `uuid` unconditionally.** Trades a visible double-count for an invisible
total outage on any host using non-UUID ids, including every host following our own documented
example.

**Coercing the value — hashing, padding, or reformatting it into UUID shape.** The same invention
with extra steps, and it would silently change what the host thinks it sent.

**Doing nothing and documenting the limitation.** Defensible, and it was the status quo. It is
rejected because the value is already in hand, the vendor has a documented slot for it, and this is
the one item in the report that makes an adopter's revenue numbers wrong without them noticing.

## What the acceptance criterion has to be

Not "two calls with the same `dedupId` produce one event". That is checkable at the HTTP layer and
these vendors fail by accepting, which is the whole reason ADR-0004 exists.

The criterion is: two `track('purchase', …)` calls carrying the same UUID-shaped `dedupId` **and
the same pinned `timestamp`** result in one event in **PostHog's own report**, checked after merges
rather than immediately; and a call carrying a non-UUID `dedupId` still sends, still lands, and
produces one diagnostic through `onError`. The verification evidence is the captured request plus
the vendor's report, per ADR-0004.

## What is owed alongside it

The documentation must say that retry deduplication needs a pinned `timestamp`, or the field will
be shipped and the double-count will persist while everyone believes it was fixed. That sentence is
the deliverable, not the field.
