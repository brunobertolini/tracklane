---
"tracklane": minor
---

Meta browser and server adapters now omit the complete contents list when any item lacks a nonempty item_id, preserving totals and order metadata instead of emitting incomplete contents. One payload-free omission warning reaches onError after the browser command or HTTP acceptance.

When canonical items are supplied, their translation takes precedence over a colliding contents property, including omission. Host-supplied contents still pass through when items are absent.

Browser providers can emit warnings through an optional fourth track argument; existing three-argument providers and calls remain compatible. TrackingError documentation now distinguishes observed errors and warnings from delivery guarantees.
