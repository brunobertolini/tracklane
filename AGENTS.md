# Agent instructions

Rules for AI agents working in this repository. Humans: see `CONTRIBUTING.md`.

This file is the single source of truth. `CLAUDE.md` is a symlink to it — edit
this file, never the symlink.

## What this library is

One interface between an application and every tool that receives user-behaviour
events. The application names an event once, in GA4's vocabulary, and the library
translates and fans it out. Adding a provider is a line of configuration instead
of a diff across the application.

Five providers in v1: **GA4, Meta, LinkedIn, PostHog, X** — browser and server.

### The rule, and the test

> The library standardises and organises. It never changes behaviour.

> **If I did not have the library, how would I write this line by hand? The
> library replicates exactly that.**

The test decides cases; the rule states the intent. A proposal that cannot be
justified as "this is what I would have written by hand" is out, however elegant.
It governs the payload, the timing and the protocol — not the control flow of the
application that no longer exists.

Full reasoning: `docs/decisions/0002-scope-and-non-goals.md` (scope and
non-goals) and `0003-public-surface.md` (the API it produced). Vendor facts:
`docs/research/providers.md`.

### Settled — do not reopen

- **No consent gate, ever.** The core never withholds a send on policy grounds.
  Consent is a mapping: the host calls, we forward to each vendor's own command,
  and forward nothing to vendors that have none. No legal basis, no audit trail.
  A complete prior implementation had all of it and never shipped in four tries.
- **We do not install vendor tags.** They belong on the page, put there the way
  each vendor documents. Injecting third-party scripts is the host's decision,
  and a duplicate configuration command emits a duplicate page view.
- **Browser and server are two libraries.** No shared runtime, no shared state,
  no types shared for convenience. They share only the vocabulary.
- **The library never invents an identifier** — not the deduplication id, not a
  client id.
- **One user identifier**, translated per vendor.
- **No per-call customisation.** No way to send different data to different
  vendors from one call. Per-vendor methods (`track.ga4()`) are rejected outright.
- **Vendor levers live on that vendor's factory**, never as an umbrella concept.

## Where this stands

**Done:** the core on both halves, and GA4 on both halves — verified end to end
against a real property, with events confirmed visible in its report.

**Next:** Meta, then LinkedIn, then PostHog, then X. One vendor at a time, both
halves before moving on: the provider contract has two halves and proving one
says nothing about the other.

LinkedIn will stress the contract hardest — no event names, no consent API, its
own identifier types, different field names per surface. **One debt is owed to
that commit:** LinkedIn is the first provider with `default: 'ignore'`, so an
unmapped event silently sends nothing. ADR-0003 promises a development-time
warning for it, and it ships with LinkedIn rather than after.

## Verifying a provider — not optional

Unit tests are necessary and **not sufficient**. Every bug that mattered here was
invisible to them: commands queued in a shape the vendor ignores (nothing reached
Google at all), person properties in the wrong shape (accepted, then dropped), a
session read from the wrong cookie, a duplicate page view on every load.

These vendors **fail by accepting**. A `204` means the request arrived, not that
the event exists.

So, whatever tooling you have:

1. Build the library and load it in a page over HTTP — the built adapter, not the
   vendor's raw SDK, or you are testing the wrong thing.
2. **Give the browser an ordinary desktop user agent.** A headless one is
   discarded as bot traffic by at least GA4, silently, so the whole exercise
   measures nothing while appearing to pass.
3. Capture the outgoing requests to confirm what left and with which parameters.
4. Read the vendor's own report to confirm the event exists. Only this step
   catches bot filtering.
5. Use a vendor's validation endpoint where one exists — GA4 has one for its
   server path, and it returns real errors where the collection endpoint accepts
   anything.

Credentials for a test property are read by variable name from the environment.
Never open an env file to get them.

## Documentation policy

**Do not replicate vendor documentation.** Our pages cover what is ours — the
surface, the translations, and the traps their documentation does not mention —
and link out for the rest.

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

- The published package is `packages/tracklane`. It ships ESM only. Never add a CJS
  build, `require` conditions or `main`-first exports.
- `exports` must keep `"types"` as the first condition.
- Public API needs TSDoc — the docs site generates its type tables from it.
- `isolatedDeclarations` is on: every exported symbol needs an explicit type.
- The docs site is a **static export**. Server-only features (route handlers with
  runtime logic, ISR, middleware, server actions, dynamic OG) do not work.
- Do not add git hooks, commitlint, husky or lefthook. CI is the gate.
- `pnpm dev` serves the docs at `https://tracklane-docs.localhost` (in a worktree:
  `https://<branch>.tracklane-docs.localhost`) — there is no fixed port to assume. Read the
  URL from portless' output, or use `dev:raw` when a plain port is required (Playwright,
  probes). Never hardcode `localhost:3000`.
- Any user-facing change needs `pnpm changeset`.

## Detailed conventions

Read the matching file before writing code in that area. Each one is scoped by
the `paths:` in its frontmatter.

| Working on                        | Read                            |
| --------------------------------- | ------------------------------- |
| `packages/tracklane/src/**`             | `.claude/rules/library-api.md`  |
| `*.test.ts`, `*.test-d.ts`        | `.claude/rules/testing.md`      |
| `apps/docs/**`                    | `.claude/rules/docs-site.md`    |

## Before finishing

```bash
pnpm check   # lint + typecheck + test + build + package validation
```
