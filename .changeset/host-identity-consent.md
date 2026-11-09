---
"@tracklane/consent": minor
---

`consentedTracking` gains `reset()`. It resets every vendor that holds a user, then forwards the stored consent again, because PostHog's own reset forgets its opt-in.
