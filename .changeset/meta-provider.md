---
'tracklane': minor
---

Add the Meta provider, on both halves.

`meta()` in the browser talks to the pixel your snippet already initialised, translating the
canonical vocabulary into Meta's standard event names and sending anything else as a custom event.
`meta({ pixelId, accessToken })` on the server posts to the Conversions API, hashing identity with
each field's own normalisation and reading the `_fbp` and `_fbc` cookies the pixel wrote.

Pass the same `dedupId` from both halves and Meta counts one conversion rather than two.

Verified against a real pixel and dataset before shipping, which is how the browser half ended up
on `fbq('track')` rather than `fbq('trackSingle')`: Meta documents where the deduplication object
goes on `track` and not on `trackSingle`, and deduplication failing is silent.
