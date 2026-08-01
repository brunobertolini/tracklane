# Contributing

Thanks for taking the time. Bug reports with a minimal reproduction are as valuable
as pull requests.

## Setup

```bash
pnpm install
```

pnpm 10. The pinned version lives in `packageManager`, so `corepack enable` is enough.
The library targets Node `>=22.14.0`; use Node 24 locally (`.nvmrc`), which is what
`portless` requires.

`pnpm dev` serves the docs at `https://tracklane-docs.localhost` instead of a port. Inside a
git worktree the branch name is prepended (`https://feat-x.tracklane-docs.localhost`), so
parallel worktrees never fight over a port. `dev:raw` skips portless if you need a
plain `localhost:3000`.

## Everyday commands

| Command             | What it does                                        |
| ------------------- | --------------------------------------------------- |
| `pnpm dev`          | Docs site at `https://tracklane-docs.localhost` (portless)  |
| `pnpm test`         | Unit tests and type tests (Vitest)                  |
| `pnpm typecheck`    | `tsc --noEmit` in every workspace                   |
| `pnpm lint:fix`     | Biome (lint, format and import sorting)             |
| `pnpm package:check`| `publint` + `attw` against the real tarball         |
| `pnpm check`        | Everything CI runs                                  |

There are no git hooks: CI is the source of truth. Run `pnpm check` before pushing.

## Pull requests

1. Branch off `develop`.
2. Add tests for behaviour changes. Public API changes also need a type test
   (`*.test-d.ts`).
3. Run `pnpm changeset` and commit the generated file. It declares the semver
   bump and writes the changelog entry. Docs-only and CI-only changes can skip it.
4. Commit messages follow [Conventional Commits](https://www.conventionalcommits.org/)
   (`feat:`, `fix:`, `docs:`, `chore:`). This is a convention: the release bump comes
   from your changeset, not the commit message.

## Code style

Biome handles formatting and linting; there is no ESLint or Prettier. Editor setup:
install the Biome extension and enable format-on-save.

## Releases

Maintainers merge to `main`. The Changesets action opens a "Version Packages" PR;
merging it publishes to npm through GitHub OIDC trusted publishing (no tokens) and
deploys the docs to GitHub Pages.
