---
"tracklane": minor
---

Identity on both halves (ADR-0014).

- **Server `identify(context)`**: PostHog receives one `$identify` with `$set` and `$unset`, and `$anon_distinct_id` only when you pass `anonymousId`. GA4 receives user properties with no event, and nothing when there is no property to send. Meta and LinkedIn receive nothing. `track` never merges.
- **Browser `reset()`**: GA4 sets `user_id` to `null`; PostHog calls `posthog.reset()`. `BrowserProvider` gains an optional `reset()`, and `identify` gains an optional `report` callback.
- **`EventContext`** gains `anonymousId` (PostHog's `distinct_id` when there is no `user.userId`, ahead of its cookie), `traitsAt` (GA4 `timestamp_micros` per user property) and `signal` (passed to every vendor request).
- **A `null` trait means "no longer known".** PostHog sends it in `$unset`; previously it set the property to `null`. GA4 leaves it out and reports it until clearing is verified.
- **GA4 server**: `ga4(credentials, { userProvidedData: true })` sends hashed `user_data` from `user`, with Google's normalisation. It is opt-in and has no consent check. An `engagement_time_msec` in event data is no longer overwritten. User property names over 24 characters and string values over 36 are left out and reported; more than 25 properties are all sent and reported.
- **PostHog**: a `distinct_id` over 200 characters is sent as given and reported, because PostHog truncates it.
