export const appName = 'tracklane';
export const docsRoute = '/docs';
export const docsImageRoute = '/og/docs';
export const docsContentRoute = '/llms.mdx/docs';

// Must mirror `basePath` in next.config.mjs. Assets fetched at runtime (the
// static search index) are not rewritten by Next and need it explicitly.
export const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? '';

export const siteUrl = 'https://tracklane.codar.me';

export const gitConfig = {
  user: 'brunobertolini',
  repo: 'tracklane',
  branch: 'main',
};
