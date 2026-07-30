export const appName = 'tln';
export const docsRoute = '/docs';
export const docsImageRoute = '/og/docs';
export const docsContentRoute = '/llms.mdx/docs';

// Must mirror `basePath` in next.config.mjs — assets fetched at runtime (the
// static search index) are not rewritten by Next and need it explicitly.
export const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? '';

export const siteUrl = 'https://brunobertolini.github.io/tln';

export const gitConfig = {
  user: 'brunobertolini',
  repo: 'tln',
  branch: 'main',
};
