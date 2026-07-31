import { siteUrl } from '@/lib/shared';

export const revalidate = false;

/**
 * Everything here is public documentation for an open-source library, so
 * everything is allowed — including the crawlers that train and answer with
 * it, which is the point.
 *
 * The `llms.txt` line is the one that matters: it is where a model should
 * start, and it points at the markdown of every page rather than the HTML.
 */
export function GET(): Response {
  const body = [
    'User-agent: *',
    'Allow: /',
    '',
    `Sitemap: ${siteUrl}/sitemap.xml`,
    `# Start here: ${siteUrl}/llms.txt`,
    '',
  ].join('\n');

  return new Response(body, { headers: { 'content-type': 'text/plain; charset=utf-8' } });
}
