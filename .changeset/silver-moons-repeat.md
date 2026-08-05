---
'tracklane': minor
---

The shared conformance suite is now published as `tracklane/conformance`.

ADR-0004 built it so that a provider written outside this repository inherits the behavioural rules
the types cannot express, and the documentation says a provider written elsewhere uses the same
contract as the ones shipped here. That claim was only half true: the suite lived inside the
repository and nobody else could run it. The first production adoption wrote two providers against
the published types, in production, without access to a single one of these checks.

```ts
import { conformsAsServerProvider } from 'tracklane/conformance';
```

`vitest` is an optional peer dependency, so this costs nothing unless you import it. There is a
`conformsAsBrowserProvider` alongside it.

**Run wrapped providers through it too.** A wrapper that delegates to a shipped provider is an
object the dispatcher cannot tell apart from any other, so it owes the same invariants — and on the
server this is what catches the expensive mistake, a wrapper whose `track` does not `await` the
provider it delegates to. That resolves before the request settles, which a serverless runtime
turns into a conversion that never left, and no type catches it because the wrapper does return a
promise.
