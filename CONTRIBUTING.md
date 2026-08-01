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

## Adding a provider

A provider talks to one vendor. It imports the contract from `tracklane` and nothing
else, and the providers shipped here use exactly that contract, so yours can do
everything theirs can. `docs/decisions/0004-how-a-provider-gets-in.md` records why the
requirements below exist.

Three of them the build checks for you: a provider may only import what the package
exports publicly, the shared conformance suite covers behaviour the types cannot
express, and the declared provider list must match the source. The conformance
suite covers less than ADR-0004 describes today; the rest is still tested per
provider, and moves into the suite when a second provider makes it worth sharing.

One thing it will check that is easy to miss: `install` must be idempotent. A host
that rebuilds its tracking, as `@tracklane/consent` does on every consent answer,
creates again and installs again.

The fourth is on you, and it is the one that matters most. **A provider is not merged
without evidence that its events arrived.** These vendors fail by accepting: a `204`
means the request reached them, not that the event exists. Every defect that has
mattered in this library was invisible to unit tests.

So a provider pull request carries:

1. The outgoing request as it left the built library, captured in a browser or from
   your server, showing the parameters that were sent.
2. A screenshot of the vendor's own report with the event visible in it.

Use an ordinary desktop user agent. At least GA4 discards headless traffic as bots,
silently, which makes the whole exercise measure nothing while appearing to pass.

This needs your own account with that vendor, and for Meta, LinkedIn and X that means
an advertiser account. There is no way around it: nobody can verify an integration
against a vendor they cannot see into. A provider that arrives slowly and verified is
worth more than one that arrives quickly and measures nothing while looking like it
does.

## Code style

Biome handles formatting and linting; there is no ESLint or Prettier. Editor setup:
install the Biome extension and enable format-on-save.

## Releases

Maintainers merge to `main`. The Changesets action opens a "Version Packages" PR;
merging it publishes to npm through GitHub OIDC trusted publishing (no tokens) and
deploys the docs to GitHub Pages.
