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

## Social cards

Drawn at build time by satori, which is a different renderer from the one the
pages use. Four things it does not forgive:

- **The route has to end in `.png`.** `opengraph-image.tsx` exports a file with
  no extension at all, GitHub Pages types that as `application/octet-stream`,
  and a crawler handed that shows no image. `/og/home.png` and
  `/og/docs/[...slug]/image.png` are both named that way on purpose. Add
  `export const dynamic = 'force-static'` or the export refuses to collect the
  route.
- **`inset: 0` sizes a box to nothing.** Give a positioned container real pixel
  dimensions, or everything inside it silently disappears.
- **Inline `<svg>` is unreliable and a data URI is not.** Satori mangled the
  logo's strokes as JSX and rendered it correctly as a `data:image/svg+xml`.
- **Fonts are read from `apps/docs/assets/fonts`, never fetched.** The pages'
  `next/font` output is woff2 and satori cannot read woff2; a CDN fetch makes
  the build depend on someone else's uptime. See the README there.

`openGraph` and `twitter` are **not** deep-merged by Next: a page that declares
either one replaces its layout's copy whole. Spread `openGraphDefaults` and
`twitterDefaults` from `lib/shared` rather than writing the fields again, or
the site name and the card type quietly vanish from that page.

Look at the PNG before believing it. Three of the four traps above built
cleanly and produced a wrong picture.
