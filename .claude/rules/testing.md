---
paths:
  - '**/*.test.ts'
  - '**/*.test-d.ts'
  - '**/vitest.config.ts'
---

# Tests

Vitest, colocated next to the source (`src/index.ts` → `src/index.test.ts`).

- Runtime behaviour goes in `*.test.ts`. Type-level behaviour goes in
  `*.test-d.ts` using `expectTypeOf` — a public API change that only shows up in
  the types still needs a test.
- Import the module under test through its relative path with `.js`
  (`from './index.js'`), the same way a consumer resolves it.
- Test the public export, not internals. If something needs a test but is not
  exported, that is a signal about the API, not a reason to export it.
- No mocking framework, no fixtures directory, no test helpers package until a
  second test actually needs them.
- `pnpm test` runs once (`vitest run`). Do not leave watch mode in a script or
  in CI.
