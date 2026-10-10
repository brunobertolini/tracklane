---
"tracklane": minor
---

Allow the GA4 browser provider to use the installed tag's routing with `ga4()` or `ga4({ events })`. Existing `ga4(measurementId, config?)` calls keep selecting that destination through `send_to`. Server credentials remain required.
