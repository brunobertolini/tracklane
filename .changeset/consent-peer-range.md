---
'@tracklane/consent': patch
---

Widen the peer range on `tracklane` so a minor release of the core stops being a breaking change
here.

The peer was declared as `workspace:*`, which publishes as the exact version of `tracklane` that
happened to be current. Every release of the core then left this package's peer range, which is a
real incompatibility rather than a bookkeeping artefact: `1.0.0` asks for exactly `tracklane@0.2.0`
and refuses `0.3.0`. It also meant each core release burned a major here for no change of its own.

The range is now explicit and spans the core's `0.x` line, so it survives a minor. Note that
`@tracklane/consent@0.2.0` shipped with the literal string `workspace:*` as its peer range, which
cannot be resolved outside this repository. A published version cannot be corrected; use `1.0.1`
or later.
