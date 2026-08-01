import { appName, docsContentRoute, siteUrl } from '@/lib/shared';
import { source } from '@/lib/source';

export const revalidate = false;

const SUMMARY =
  'One interface between an application and every tool that receives user-behaviour events, in the browser and through their server-side conversion APIs. Name an event once, in GA4 vocabulary, and it reaches every configured tool. GA4 ships today. Meta, LinkedIn, PostHog and X are next. It standardises and organises and never changes behaviour: no consent decisions, no queues, no retries, and it does not install vendor tags.';

/**
 * The index an LLM reads first.
 *
 * Every link is absolute and points at the **markdown** of the page, not its
 * HTML: a model that follows a relative link from a file it fetched elsewhere
 * resolves it against the wrong origin, and one that follows an HTML link pays
 * for markup it cannot use. The site is served under a base path on project
 * pages, which relative links would also get wrong.
 */
export function GET(): Response {
  const pages = source
    .getPages()
    .map((page) => {
      const slug = page.slugs.length > 0 ? `/${page.slugs.join('/')}` : '';
      const url = `${siteUrl}${docsContentRoute}${slug}/content.md`;
      const description = page.data.description ?? '';

      return `- [${page.data.title}](${url})${description ? `: ${description}` : ''}`;
    })
    .sort();

  return new Response(
    [`# ${appName}`, '', `> ${SUMMARY}`, '', '## Docs', '', ...pages, ''].join('\n'),
    { headers: { 'content-type': 'text/plain; charset=utf-8' } },
  );
}
