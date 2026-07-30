# tln

[![CI](https://github.com/brunobertolini/tln/actions/workflows/ci.yml/badge.svg)](https://github.com/brunobertolini/tln/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/@brunobertolini/tln)](https://www.npmjs.com/package/@brunobertolini/tln)
[![OpenSSF Scorecard](https://api.scorecard.dev/projects/github.com/brunobertolini/tln/badge)](https://scorecard.dev/viewer/?uri=github.com/brunobertolini/tln)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)

> TODO: one-line description of the library.

**Documentation:** https://brunobertolini.github.io/tln

## Repository layout

| Path            | What it is                                              |
| --------------- | ------------------------------------------------------- |
| `packages/tln`  | The published library (`@brunobertolini/tln`), ESM-only |
| `apps/docs`     | Documentation site (Fumadocs, static export)            |
| `docs/decisions`| Architecture Decision Records                            |

## Development

```bash
pnpm install
pnpm dev          # docs site at http://localhost:3000
pnpm test         # unit + type tests
pnpm check        # everything CI runs
```

Requires Node.js `>=22.14.0` and pnpm 10 (`corepack enable` or a global install).

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md). Every user-facing change needs a changeset
(`pnpm changeset`); releases are published from `main` with npm trusted publishing.

## License

MIT © Bruno Bertolini
