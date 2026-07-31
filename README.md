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

## First-time setup

The repository ships with placeholder names. To claim it:

```bash
pnpm setup
```

It asks for the npm package name, GitHub owner/repo, author and docs domain, then
rewrites every place they appear — manifests, docs site, workflows, changesets config,
CODEOWNERS, FUNDING, README — renames `packages/<name>`, and writes a `CNAME` (or keeps
the GitHub Pages base path) depending on your answer about the domain.

```bash
pnpm setup -- --dry-run                        # preview, writes nothing
pnpm setup -- --name @scope/x --owner me --yes # non-interactive
```

It is safe to run again later to rename the project. The ADR under `docs/decisions/`
is left untouched on purpose — it records what was decided at the time.

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
