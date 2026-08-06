---
'tracklane': minor
---

A vendor's refusal now carries the vendor's own answer. All three server providers used to throw
`meta: the Conversions API answered 400` and discard the response body, which is the one place the
vendor explains itself, so the diagnosis a host got was "it failed" with nowhere to go from there.

They now throw a `VendorResponseError`, exported from `tracklane`, carrying `provider`, `status`
and the response `body` verbatim. It arrives on `TrackingError.cause`:

```ts
import { isVendorResponseError } from 'tracklane';

onError: (error) => {
  if (isVendorResponseError(error.cause)) {
    // error.cause.status  400
    // error.cause.body    what the vendor actually said
  }
};
```

Use `isVendorResponseError`, not `instanceof`: two copies of this package in one `node_modules`
produce two classes and one silent `false`, and the guard reads a brand that survives both.

**The messages are unchanged**, deliberately. Putting the vendor's error code in them would not
split anything in Sentry, whose default grouping uses the stack trace, and every refusal in a
provider throws from one line. What splits them is a fingerprint you set from `cause.status` and
whatever code you parse out of `cause.body`; the docs carry the recipe.

**One guarantee is narrower than it was.** `message` still never contains event data. `body` is the
vendor's words, and Meta's Graph API quotes the parameter it refused, so a logger you hand the
whole error to and that serialises what it is given can now pick up event data that was previously
impossible to reach. Sentry's `captureException` does not, unless you add
`extraErrorDataIntegration`.

Preconditions are untouched: GA4 with no `client_id`, PostHog with no `distinct_id` and Meta with
no `user_data` throw before a request exists, so there is no response to carry and they stay bare
errors. Reasoning in `docs/decisions/0013-what-a-vendor-refusal-carries.md`.

**If you maintain a provider of your own**, `tracklane/conformance` now asserts this on its
transport-failure case: a provider that throws a bare `Error` when its vendor refuses fails the
suite. Throw a `VendorResponseError` instead. The precondition cases are not affected.
