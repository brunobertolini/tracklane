# tracklane

[![CI](https://github.com/brunobertolini/tracklane/actions/workflows/ci.yml/badge.svg)](https://github.com/brunobertolini/tracklane/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/tracklane)](https://www.npmjs.com/package/tracklane)
[![OpenSSF Scorecard](https://api.scorecard.dev/projects/github.com/brunobertolini/tracklane/badge)](https://scorecard.dev/viewer/?uri=github.com/brunobertolini/tracklane)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)

> One interface between your application and every tool that receives events.

Name an event once, in GA4's vocabulary, and it reaches every tool you configured, in the
browser and through their server-side conversion APIs. Adding a tool is a line of configuration
instead of a diff across your whole application.

```ts
// in the browser
import { createTracking, ga4 } from 'tracklane/browser';

const { track } = createTracking({ providers: [ga4('G-XXXXXXX')] });

track('purchase', { transaction_id: 'T-1', value: 49.9, currency: 'BRL' });
```

```ts
// on your server, where the conversion APIs live
import { createTracking, ga4 } from 'tracklane/server';

const { track } = createTracking({
  providers: [ga4({ measurementId: 'G-XXXXXXX', apiSecret })],
});

await track('purchase', order, { cookies: request.headers.get('cookie') });
```

It standardises and organises, and it never changes behaviour: no consent decisions, no queues,
no retries, no vendor tags injected into your page, no opinion about what you should measure.
Whatever a tool receives is what it would have received from a hand-written call.

**GA4** ships today. **Meta, LinkedIn, PostHog and X** are next. Any tool that receives
events about what your users do can be a destination, using the same public contract.

**Documentation:** https://tracklane.codar.me · **npm:** https://www.npmjs.com/package/tracklane

## Contributing

```bash
pnpm install
pnpm dev      # documentation site
pnpm check    # everything CI runs: lint, types, tests, build, package validation
```

Requires pnpm 10 and Node 24 locally (see `.nvmrc`); the published library targets Node
`>=22.14.0`.

Every user-facing change needs a changeset (`pnpm changeset`). Releases publish from `main`
through npm trusted publishing, so no token lives in this repository.

See [CONTRIBUTING.md](./CONTRIBUTING.md) for the rest, and [AGENTS.md](./AGENTS.md) for how the
library is meant to be extended. It holds the rule that settles design arguments and the list
of decisions that are closed.

| Path                  | What it is                                    |
| --------------------- | --------------------------------------------- |
| `packages/tracklane`  | The published library, ESM-only               |
| `apps/docs`           | Documentation site (Fumadocs, static export)  |
| `docs/decisions`      | Architecture Decision Records                 |
| `docs/research`       | What each vendor actually requires            |

## License

MIT © Bruno Bertolini
