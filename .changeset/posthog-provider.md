---
'tracklane': minor
---

Add the PostHog provider, on both halves.

`posthog()` in the browser talks to the instance your snippet already initialised. PostHog accepts
any string as an event name, so the canonical vocabulary passes straight through with no map and
no translation.

`posthog({ apiKey })` on the server posts to the Capture API. It resolves `distinct_id` from
`context.user.userId` first, and falls back to the anonymous id PostHog's own tag wrote to its
cookie, so a server event lands on the same person the browser is already building. When it has
neither it refuses to send, because inventing an id would create a second person rather than fail.

Verified against a real project before shipping, including the part that is easiest to get wrong
and hardest to notice: a server event sent with no `userId` at all landed on the same person the
browser had created.
