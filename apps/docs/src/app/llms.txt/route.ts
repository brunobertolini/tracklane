import { serverApiPhrase, statusSentence } from '@/lib/providers';
import { appName, docsContentRoute, siteUrl } from '@/lib/shared';
import { source } from '@/lib/source';

export const revalidate = false;

/**
 * What the library is, in the words a reader arrives with.
 *
 * The status half is generated: this file used to assert "GA4 ships today,
 * Meta is next" by hand, and it was the last place a release remembered to
 * correct. The vocabulary half names the vendors' own APIs, because a question
 * about this problem is almost never phrased as "server-side analytics". It is
 * phrased as the Conversions API, which is the name the vendor uses.
 */
function summary(): string {
  return [
    'One interface between an application and every tool that receives user-behaviour events,',
    `in the browser and through each vendor's own conversion API (${serverApiPhrase()}).`,
    'Name an event once, in GA4 vocabulary, and it reaches every configured tool, translated',
    "into that tool's event names, payload shape and identifiers, with one deduplication id",
    'shared between the browser event and the server one.',
    statusSentence(),
    'It standardises and organises and never changes behaviour: no consent decisions, no queues,',
    'no retries, and it does not install vendor tags.',
  ].join(' ');
}

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
    [`# ${appName}`, '', `> ${summary()}`, '', '## Docs', '', ...pages, ''].join('\n'),
    { headers: { 'content-type': 'text/plain; charset=utf-8' } },
  );
}
