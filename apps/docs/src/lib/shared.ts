export const appName = 'tracklane';
export const docsRoute = '/docs';
export const docsImageRoute = '/og/docs';

/**
 * The home page's card. A route ending in `.png` so the exported file does
 * too: GitHub Pages types by extension, and a crawler sent
 * `application/octet-stream` shows no image at all.
 */
export const homeImageRoute = '/og/home.png';
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

/**
 * The social tags every page repeats, and why they are repeated rather than
 * inherited.
 *
 * Next does not deep-merge `openGraph` or `twitter`: a page that declares
 * either one replaces its layout's copy whole. So a page setting only a
 * description silently drops the site name and the card type along with it.
 * Spreading these is the only way both survive.
 *
 * They are not decoration. Without `type` and `siteName`, Facebook treats the
 * card as incomplete and falls back to a generic one; without
 * `summary_large_image`, X renders the thumbnail beside the text instead of
 * the image we drew, so the image may as well not exist.
 */
export const openGraphDefaults = {
  type: 'website',
  siteName: appName,
  url: siteUrl,
} as const satisfies { type: 'website'; siteName: string; url: string };

export const twitterDefaults = {
  card: 'summary_large_image',
  creator: '@brunobertolini',
} as const satisfies { card: 'summary_large_image'; creator: string };
