---
'tracklane': minor
---

`posthog.server` now forwards `context.dedupId` as PostHog's `uuid`, the field it deduplicates on,
so a retried webhook no longer writes a second event. The provider previously dropped the value and
claimed in a comment that the Capture API documented no deduplication key, which was wrong.

**Two things this does not do, and both matter before you rely on it.**

PostHog collapses events sharing `uuid`, event name, **timestamp** and `distinct_id`. Left to
default, `timestamp` is the moment of the call, so a retry carries a different one and nothing is
deduplicated. Pin it to a value derived from the order.

The id must be a UUID. PostHog rejects other shapes rather than ignoring them, so a `dedupId` that
is an order number is not forwarded: the event still sends, and one warning reaches `onError`
explaining why. Both v4 and v7 layouts are accepted.

Deduplication is eventual, happening during a background merge, so both rows are visible for a
while. Reasoning in `docs/decisions/0009-posthog-deduplication.md`.
