---
paths:
  - 'packages/tln/src/**/*.ts'
  - 'packages/tln/*.config.ts'
---

# Library source

The published surface. Everything here ships to npm as ESM.

- `isolatedDeclarations` is on: every exported symbol needs an explicit return
  and property type. Inference is not enough — including default exports in
  `*.config.ts` files.
- Every exported symbol needs TSDoc with `@param`, `@returns` and at least one
  `@example`. The docs site generates its type tables from it.
- Relative imports carry the `.js` extension (`./index.js`), never `.ts` and
  never extensionless — `verbatimModuleSyntax` + bundler resolution require it.
- Type-only imports use `import type` / `import { type X }`.
- `sideEffects: false` is declared in `package.json`: no top-level work outside
  function bodies (no I/O, no mutation of globals, no registry side effects).
- `exactOptionalPropertyTypes` and `noUncheckedIndexedAccess` are on. An optional
  property is absent or has its type — never explicitly `undefined`. Indexed
  access returns `T | undefined`; narrow it.
- Adding, renaming or removing an exported symbol is a user-facing change:
  `pnpm changeset` in the same commit.
