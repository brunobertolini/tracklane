export const appName = 'tracklane';
export const docsRoute = '/docs';
export const docsImageRoute = '/og/docs';
export const docsContentRoute = '/llms.mdx/docs';

// Must mirror `basePath` in next.config.mjs. Assets fetched at runtime (the
// static search index) are not rewritten by Next and need it explicitly.
export const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? '';

export const siteUrl = 'https://tracklane.codar.me';

export const authorName = 'Bruno Bertolini';

/**
 * Where the author actually is, rather than where a byline usually points.
 *
 * No campaign parameters: nobody on the receiving end can read them here, and
 * a parameter no report will ever show is noise in the address bar and a
 * promise of measurement that is not kept.
 */
export const authorUrl = 'https://x.com/brunobertolini';

/**
 * Whose domain this is served from.
 *
 * The site lives at a subdomain of the studio, so a byline naming only a person
 * leaves the address bar unexplained: the reader arrives at a company and is
 * told an individual wrote it, with nothing joining the two. Saying both is
 * cheaper than a domain of our own, and it answers the question the address
 * raises before anyone has to ask it.
 */
export const studioName = 'Codar.me';
export const studioUrl = 'https://codar.me';

export const gitConfig = {
  user: 'brunobertolini',
  repo: 'tracklane',
  branch: 'main',
};
