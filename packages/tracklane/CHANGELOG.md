# tracklane

## 0.2.0

### Minor Changes

- [#12](https://github.com/brunobertolini/tracklane/pull/12) [`99b7390`](https://github.com/brunobertolini/tracklane/commit/99b73900be51c7275a1b29f31f7f2e6cdcb178ad) Thanks [@brunobertolini](https://github.com/brunobertolini)! - Add the Meta provider, on both halves.

  `meta()` in the browser talks to the pixel your snippet already initialised, translating the
  canonical vocabulary into Meta's standard event names and sending anything else as a custom event.
  `meta({ pixelId, accessToken })` on the server posts to the Conversions API, hashing identity with
  each field's own normalisation and reading the `_fbp` and `_fbc` cookies the pixel wrote.

  Pass the same `dedupId` from both halves and Meta counts one conversion rather than two.

  Verified against a real pixel and dataset before shipping, which is how the browser half ended up
  on `fbq('track')` rather than `fbq('trackSingle')`: Meta documents where the deduplication object
  goes on `track` and not on `trackSingle`, and deduplication failing is silent.

## 0.1.1

### Patch Changes

- [`54cc790`](https://github.com/brunobertolini/tracklane/commit/54cc790f8fcea380d1b125523312277c80f8a75d) Thanks [@brunobertolini](https://github.com/brunobertolini)! - Fixes the package README, which shipped in 0.1.0 still describing a placeholder API that does not
  exist. That file is the package's page on npm, so the first thing anyone saw was documentation for
  a function the library never had.

  Also points the documentation links at the project's own domain.

  Documents every field of the published types. The API reference tables are generated from the
  TSDoc in this package, and most properties carried none, so the tables arrived with an empty
  description column on the site and in the `.d.ts` files shipped here.

  Rewrites the two diagnostics GA4 raises through `onError` so each says what to do about the
  failure, not only what failed.

## 0.1.0

### Minor Changes

- [`4ad3af0`](https://github.com/brunobertolini/tracklane/commit/4ad3af0b83d1d2ae40b625e6246ce941bdd5175f) Thanks [@brunobertolini](https://github.com/brunobertolini)! - One interface between an application and every tool that receives user-behaviour events.

  `createTracking` from `/browser` and `/server` fans an event out to every configured provider,
  translating GA4's canonical vocabulary into each vendor's own. The two entry points are two
  independent libraries that share only the vocabulary.

  Ships the GA4 provider on both surfaces — `gtag.js` in the browser, the Measurement Protocol on
  the server — plus the public `Provider` contract that third-party providers implement.

  The core never withholds a send on policy grounds: it maps events, forwards consent to the
  vendors that document a command for it, and decides nothing on the host's behalf.
