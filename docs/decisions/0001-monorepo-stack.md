# ADR-0001 — Monorepo stack: OSS TypeScript library + static docs with Fumadocs

- **Status:** accepted
- **Date:** 2026-07-30
- **Decision context:** triangulation between three models (Fable, GPT-5.5 via Codex, Grok),
  with empirical verification of versions and of how the tools actually behave in this repo.

## Context

Greenfield repository. Goal: a monorepo following the dominant mid-2026 convention for a
serious open-source TypeScript library, plus a **static** documentation site built with
**Fumadocs** (fixed requirement). Nothing beyond that — no backend, no database, no AI
features.

Fixed by the owner's decision: **MIT** licence, docs deployed to **GitHub Pages**, library
with a **placeholder API** (the domain to be filled in later).

## Decision summary

| # | Topic | Decision | Strongest rejected alternative |
|---|-------|----------|--------------------------------|
| 1 | Package manager | pnpm 10 + `workspace:` + `catalog:` | bun |
| 2 | Task runner | Turborepo (minimal config) | plain pnpm scripts |
| 3 | Layout | `packages/tln` + `apps/docs`, scoped package | flat `packages/*`, unscoped name |
| 4 | Library build | tsdown (Rolldown), **ESM-only** | tsup; dual CJS+ESM |
| 5 | TypeScript | `tsconfig.base.json` at the root, no project references | `@repo/typescript-config` package |
| 6 | Tests | Vitest + coverage v8 + `expectTypeOf` | `node:test` |
| 7 | Lint/format | Biome 2.5 (single tool) | ESLint 9 flat + Prettier |
| 8 | Release | Changesets + npm trusted publishing (OIDC) | semantic-release / release-please |
| 9 | CI | GitHub Actions: ci, docs, release, codeql, scorecard + Renovate | Dependabot |
| 10 | Docs | Fumadocs 16 + Next 16, `output: 'export'`, Orama static, `fumadocs-typescript` | Pagefind / Algolia / typedoc |
| 11 | Docs deploy | GitHub Pages with `basePath` | Vercel / Cloudflare Pages |
| 12 | OSS hygiene | MIT, Contributor Covenant, SECURITY, templates, **no git hooks** | husky + commitlint |
| 13 | Extras | knip, AGENTS.md, llms.txt, CodeQL, Scorecard | — |

## Decisions

### 1. pnpm 10 with catalog

`packageManager` pinned (`pnpm@10.26.2`), `engines.node: ">=22.14.0"`, `.nvmrc` at 24.
Versions shared across workspaces (`typescript`, `@types/node`) live in the `catalog:` of
`pnpm-workspace.yaml` — a single source of truth, rewritten on publish.

**Rejected — bun:** faster installs, but the entire OSS publishing path (Changesets, OIDC,
provenance) is built on npm/pnpm.

**Note:** stay on pnpm 10.x. There are reports of OIDC publishing breaking on pnpm 11.

### 2. Turborepo

The only real disagreement between the three consultants (2 in favour, 1 against). The
argument against is a good one: with 1 library and 1 site, the cache almost never hits,
because docs rebuild whenever the library changes. The decisive argument in favour:
`dependsOn: ["^build"]` gives declared topological ordering instead of ordering implicit in
scripts, it is what a contributor expects to find in a TS monorepo, and the cost is a 30-line
file.

**Rejected — plain pnpm scripts:** they work today, they become chained `&&` as soon as the
repo grows. **Rejected — Nx/moon:** too much surface for two workspaces.

### 3. Layout and naming

`packages/*` publishes, `apps/*` deploys. The package is scoped: a scope guarantees a
namespace and removes any fight over the name.

**Verified:** unscoped `tln` is already taken on npm (a third-party 1.0.3) — an unscoped name
was never an option. The current name `@brunobertolini/tln` is **provisional** (see "Open
decisions").

### 4. tsdown, ESM-only

tsdown is the maintained successor to tsup, built on Rolldown 1.x. Format is **ESM-only**:
dual CJS+ESM in 2026 is pure cost — two output graphs, two sets of types, and the whole bug
surface of types masquerading.

Package contract: `"type": "module"`, `sideEffects: false`, `files: ["dist"]`, `exports` with
`"types"` as the **first** condition, sourcemaps published.

**CI gate:** `publint --strict` + `attw --pack . --profile esm-only`, running against the
**real tarball** (`pnpm pack`), not the directory. The `esm-only` profile is what declares
that resolution from CJS is unsupported — without it, attw fails by design.

### 5. TypeScript

`tsconfig.base.json` at the root, each workspace extends it. **No** `@repo/typescript-config`
package: that convention exists for monorepos with many consumers; with two, it is
indirection. No project references — tsdown builds the library, Next builds the docs.

Flags: `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`,
`verbatimModuleSyntax`, `isolatedDeclarations` (in the library), `target: es2023`,
`moduleResolution: bundler` (validated from the consumer side by `attw`).

**Verified empirically, two adjustments required:**

1. `isolatedDeclarations` breaks in config files (`tsdown.config.ts`, `vitest.config.ts`)
   because it cannot infer the default export — solved with an explicit type annotation, not
   by turning the flag off.
2. `exactOptionalPropertyTypes` is **off in `apps/docs`**: React/Fumadocs props are not
   written against that flag. It stays on in the published library, where the API is ours.

**TypeScript version: 6.x, not 7.x.** TS 7 (the Go port) is already `latest` on npm, but
Fumadocs' own official template still pins `^6.0.3`, and `fumadocs-typescript` depends on
`ts-morph`. Migrate when the docs ecosystem declares support.

### 6. Vitest

Co-located tests (`src/**/*.test.ts`), type tests in `*.test-d.ts` with `expectTypeOf` and
`typecheck` enabled — no extra dependency (no tsd, no expect-type). Coverage v8 with an 80%
threshold on the library only; the docs site has no threshold.

### 7. Biome

One tool for linting, formatting and import ordering. Single config at the root, with a
`next`/`react` domain override for `apps/docs`.

**Rejected — ESLint 9 + Prettier:** two tools, two configs, slower CI, for equivalent coverage
in a repo with no custom plugins. The cost for contributors used to ESLint is real, and is
mitigated by documenting `pnpm lint:fix` in CONTRIBUTING.

**Verified pitfall:** `biome.json` **does not accept comments**. A comment in the file makes
Biome silently fall back to defaults — the symptom is `biome ci` sweeping `.next/` and `out/`
and reporting tens of thousands of errors. If a comment is needed, rename to `biome.jsonc`.

### 8. Changesets + trusted publishing

The semver bump and the changelog note are declared in the PR (`pnpm changeset`) and
reviewable in the diff — which is the right model for a library, where breaking intent cannot
be inferred from a commit message.

Publishing via **OIDC (trusted publishing)**, with no long-lived token in the repo; provenance
is generated automatically. **JSR: no** — npm is the source of truth; adding a second registry
for a hypothetical audience is cost without return.

### 9. CI

Five workflows: `ci` (quality + Node 22/24 test matrix), `docs` (static build + Pages deploy),
`release` (Changesets + OIDC), `codeql`, `scorecard`.

**Verified directly against the repositories' tags** (not from model memory, which was wrong
here): `actions/checkout@v7`, `actions/setup-node@v7`, `pnpm/action-setup@v6`,
`actions/configure-pages@v6`, `actions/upload-pages-artifact@v5`, `actions/deploy-pages@v5`,
`changesets/action@v1`, `github/codeql-action@v4`, `ossf/scorecard-action@v2.4.4`.

> **Correction (2026-07-31), and it undercuts the sentence above.** `ossf/scorecard-action@v2`
> does not exist — that repository publishes only patch tags (`v2.4.4` and earlier), so the
> workflow failed on its first run with "unable to find version". The claim of having verified
> these against the repositories' tags did not hold for this one, which is worth recording
> precisely because the paragraph was written to assert the opposite.

The workflows reference majors; Renovate is configured with
`helpers:pinGitHubActionDigests` and converts them to SHAs in the first PR — which is what
Scorecard requires, without demanding the SHAs be written by hand now.

### 10. Fumadocs

Generated from the official `+next+fuma-docs-mdx+static` template (Fumadocs 16.14 / Next 16.2
/ React 19.2 / Tailwind 4). The template already ships what matters for static export:
**Orama static** search (index in a file, resolved in the browser), `llms.txt`, and OG images
generated at build time.

API reference via `fumadocs-typescript` + `AutoTypeTable`, reading the library's **source**
(`packages/tln/src/index.ts`) — the type table is generated from TSDoc and cannot drift from
the code. **Rejected — typedoc-plugin-markdown:** generates hundreds of pages orthogonal to
the site's design.

Versioned docs: **not** for now. i18n: out of scope.

The home page imports the real published API from the library: if the library breaks, the docs
build breaks with it.

### 11. GitHub Pages

A fully static site uses nothing a file host cannot serve, and keeps code, CI, releases and
docs with the same provider, with no extra account.

**The `basePath` pitfall, handled:** project pages are served under `/<repo>`.
`next.config.mjs` reads `NEXT_PUBLIC_BASE_PATH` (set by the workflow to `/tln`);
`trailingSlash: true` and `images.unoptimized`. The search index is a file fetched at runtime
that Next does **not** rewrite — hence
``staticClient({ from: `${basePath}/api/search` })`` in `src/components/search.tsx`. This is
the classic "search works locally, breaks in production" bug.

**Verified:** building with `NEXT_PUBLIC_BASE_PATH=/tln` produces `out/api/search` (~22 KB)
and assets under `/tln/_next/…`.

### 12. OSS hygiene

MIT, Contributor Covenant 3.0, CONTRIBUTING, SECURITY (via GitHub Private Vulnerability
Reporting, not email), YAML issue forms, PR template, CODEOWNERS, `.editorconfig`, FUNDING,
AGENTS.md.

**No git hooks, no commitlint.** Releases do not depend on commit messages (Changesets), so
commit enforcement is process without a consumer; lint and format are CI gates. A local hook
only adds friction for outside contributors.

### 13. Extras

`knip` in CI (dead files, deps and exports), `AGENTS.md` (keeps agents from reintroducing
tsup/ESLint/husky), `llms.txt` (from the template), CodeQL and OpenSSF Scorecard.

## Open decisions (owner's call)

1. ~~**Final package name and scope.**~~ **Settled 2026-07-31: `tracklane`, unscoped.** Decision
   3 above chose a scope only because `tln` was taken; `tracklane` is free, so the scope buys
   nothing and costs every consumer a prefix. The `@tracklane` org is reserved for satellites —
   a CMP preset, framework helpers — which is what a scope is actually for.
2. ~~**The library's real description and API.**~~ Settled: the placeholders are gone.
3. **Custom domain for the docs.** With a domain of its own, `basePath` disappears — delete
   the `env:` block from `docs.yml` and adjust `siteUrl` in `apps/docs/src/lib/shared.ts`.
4. **First publish.** The trusted publisher is configured per package on npmjs.com and the
   package must exist first. Sequence: manual publish of 0.1.0 → configure the trusted
   publisher pointing at `release.yml` → subsequent releases go out over OIDC.

## Runbook — what is left to do on GitHub

- Create the `brunobertolini/tracklane` repo and push `develop` and `main`.
- Settings → Pages → Source: **GitHub Actions**.
- Settings → Security → enable **Private vulnerability reporting**.
- Branch protection on `main`: require the `Quality`, `Test (Node 22)` and `Test (Node 24)`
  checks.
- Install the **Renovate** app.
- Enable Discussions (the issues `config.yml` points there).

> **Note (2026-07-31):** the package was renamed from `@brunobertolini/tln` to `tracklane` and
> the scope dropped. The body of this record keeps the original names on purpose — a decision
> record says what was decided at the time, and the rename is recorded above rather than
> rewritten into history.
