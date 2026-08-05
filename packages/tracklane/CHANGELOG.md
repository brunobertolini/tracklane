# tracklane

## 0.4.0

### Minor Changes

- [`0861cab`](https://github.com/brunobertolini/tracklane/commit/0861cabb80b81dd28f383d9732b14888cb8ca8f5) Thanks [@brunobertolini](https://github.com/brunobertolini)! - `posthog.server` now forwards `context.dedupId` as PostHog's `uuid`, the field it deduplicates on,
  so a retried webhook no longer writes a second event. The provider previously dropped the value and
  claimed in a comment that the Capture API documented no deduplication key, which was wrong.

  **Two things this does not do, and both matter before you rely on it.**

  PostHog collapses events sharing `uuid`, event name, **timestamp** and `distinct_id`. Left to
  default, `timestamp` is the moment of the call, so a retry carries a different one and nothing is
  deduplicated. Pin it to a value derived from the order.

  The id must be a UUID. PostHog rejects other shapes rather than ignoring them, so a `dedupId` that
  is an order number is not forwarded: the event still sends, and one warning reaches `onError`
  explaining why. Both v4 and v7 layouts are accepted.

  Deduplication is eventual, happening during a background merge, so both rows are visible for a
  while. Reasoning in `docs/decisions/0009-posthog-deduplication.md`.

## 0.3.0

### Minor Changes

- [#14](https://github.com/brunobertolini/tracklane/pull/14) [`6f32e78`](https://github.com/brunobertolini/tracklane/commit/6f32e78fd9f43b39005636737f932d07a8d26ab8) Thanks [@brunobertolini](https://github.com/brunobertolini)! - Add the PostHog provider, on both halves.

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
