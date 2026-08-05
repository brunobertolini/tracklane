# @tracklane/consent

## 1.0.1

### Patch Changes

- [#16](https://github.com/brunobertolini/tracklane/pull/16) [`8664e19`](https://github.com/brunobertolini/tracklane/commit/8664e195b2d70f21f5fcb141fd67c0ee9a2e618f) Thanks [@brunobertolini](https://github.com/brunobertolini)! - Widen the peer range on `tracklane` so a minor release of the core stops being a breaking change
  here.

  The peer was declared as `workspace:*`, which publishes as the exact version of `tracklane` that
  happened to be current. Every release of the core then left this package's peer range, which is a
  real incompatibility rather than a bookkeeping artefact: `1.0.0` asks for exactly `tracklane@0.2.0`
  and refuses `0.3.0`. It also meant each core release burned a major here for no change of its own.

  The range is now explicit and spans the core's `0.x` line, so it survives a minor. Note that
  `@tracklane/consent@0.2.0` shipped with the literal string `workspace:*` as its peer range, which
  cannot be resolved outside this repository. A published version cannot be corrected; use `1.0.1`
  or later.

## 1.0.0

### Patch Changes

- Updated dependencies [[`99b7390`](https://github.com/brunobertolini/tracklane/commit/99b73900be51c7275a1b29f31f7f2e6cdcb178ad)]:
  - tracklane@0.2.0

## 0.2.0

### Minor Changes

- [`e67d9f0`](https://github.com/brunobertolini/tracklane/commit/e67d9f0ec932727d6e7cde796d9c0852b22dfb2b) Thanks [@brunobertolini](https://github.com/brunobertolini)! - First release of the two consent packages.

  `@tracklane/consent` holds the visitor's answer in a first-party cookie whose format is public
  contract, readable in devtools and by a server on every request. `@tracklane/consent-rules`
  surveys what a jurisdiction requires before measurement may begin, as dated and sourced data.

  Neither is a consent gate. `tracklane` still cannot decide not to send and never learns what a
  consent category is: which vendors exist is decided before `createTracking`, in the host's own
  code, with one entry point here doing the wiring.

  The two do not depend on each other. A host that wants a jurisdiction to pick its category
  defaults passes `rulesFor(region).defaults` itself.
