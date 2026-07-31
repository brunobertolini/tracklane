---
paths:
  - 'apps/docs/**'
---

# Docs site

Fumadocs on Next.js with `output: 'export'`. It builds to static files — there
is no server at runtime.

- No route handlers with runtime logic, no middleware, no server actions, no
  ISR, no dynamic OG images, no `cookies()`/`headers()`. If a feature needs a
  request, it does not belong here.
- Every dynamic route needs `generateStaticParams`. `dynamicParams` stays false.
- Content lives in `apps/docs/content` as MDX. Prose changes go there, not in
  components.
- Type tables come from the TSDoc in `packages/tracklane`. Fix the source comment
  rather than writing the table by hand.
- Biome applies the `next` and `react` domains only under this directory — lint
  errors here can differ from the rest of the repo.
