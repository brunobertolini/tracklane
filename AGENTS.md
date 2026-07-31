# Agent instructions

Rules for AI agents working in this repository. Humans: see `CONTRIBUTING.md`.

## Stack — do not swap these out

| Concern     | Tool                                    |
| ----------- | --------------------------------------- |
| Packages    | pnpm 10 workspaces (`workspace:`, `catalog:`) |
| Tasks       | Turborepo                               |
| Lib build   | tsdown (Rolldown), **ESM-only**         |
| Tests       | Vitest (`*.test.ts`, `*.test-d.ts`)     |
| Lint/format | Biome — **no ESLint, no Prettier**      |
| Releases    | Changesets + npm trusted publishing     |
| Docs        | Fumadocs on Next.js, `output: 'export'` |
| Dev server  | portless — named HTTPS URL, worktree-aware |

Rationale and rejected alternatives: `docs/decisions/0001-monorepo-stack.md`.
Read it before proposing a change to any of the above.

## Rules

- The published package is `packages/tln`. It ships ESM only. Never add a CJS
  build, `require` conditions or `main`-first exports.
- `exports` must keep `"types"` as the first condition.
- Public API needs TSDoc — the docs site generates its type tables from it.
- `isolatedDeclarations` is on: every exported symbol needs an explicit type.
- The docs site is a **static export**. Server-only features (route handlers with
  runtime logic, ISR, middleware, server actions, dynamic OG) do not work.
- Do not add git hooks, commitlint, husky or lefthook. CI is the gate.
- `pnpm dev` serves the docs at `https://tln-docs.localhost` (in a worktree:
  `https://<branch>.tln-docs.localhost`) — there is no fixed port to assume. Read the
  URL from portless' output, or use `dev:raw` when a plain port is required (Playwright,
  probes). Never hardcode `localhost:3000`.
- Any user-facing change needs `pnpm changeset`.

## Before finishing

```bash
pnpm check   # lint + typecheck + test + build + package validation
```
