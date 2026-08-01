---
'tracklane': patch
---

Fixes the package README, which shipped in 0.1.0 still describing a placeholder API that does not
exist. That file is the package's page on npm, so the first thing anyone saw was documentation for
a function the library never had.

Also points the documentation links at the project's own domain.

Documents every field of the published types. The API reference tables are generated from the
TSDoc in this package, and most properties carried none, so the tables arrived with an empty
description column on the site and in the `.d.ts` files shipped here.

Rewrites the two diagnostics GA4 raises through `onError` so each says what to do about the
failure, not only what failed.
