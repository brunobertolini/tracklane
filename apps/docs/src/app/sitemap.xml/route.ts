import { docsRoute, siteUrl } from '@/lib/shared';
import { source } from '@/lib/source';

export const revalidate = false;

/** Absolute URLs, because a sitemap is read from outside the site. */
export function GET(): Response {
  const paths = ['', docsRoute, ...source.getPages().map((page) => page.url)];
  const unique = [...new Set(paths)].sort();

  const body = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...unique.map((path) => `  <url><loc>${siteUrl}${path}</loc></url>`),
    '</urlset>',
    '',
  ].join('\n');

  return new Response(body, { headers: { 'content-type': 'application/xml; charset=utf-8' } });
}
