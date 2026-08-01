import type { ReactNode } from 'react';
import { ga4MeasurementId } from '@/lib/analytics';

/**
 * The consent declaration and the property configuration, in one block, in
 * that order, because Google requires the declaration before any measurement.
 * This runs before `@tracklane/consent` or any other module of this bundle
 * does (ADR-0006, "The initial declaration stays in the page"), so it reads
 * the cookie by hand rather than through the library.
 *
 * `tl_consent` is `cookieStorage`'s default name, fixed as public contract by
 * the same ADR, and the format is `name:decision` pairs joined by `|` — no
 * encoding, so a plain regex reads it.
 *
 * Analytics defaults to denied unless the cookie explicitly grants it,
 * mirroring this site's own consent region (`consentRegion` in
 * `lib/analytics.ts`): opt-in, nothing measured until asked.
 *
 * The advertising signals are always denied, cookie or not. This site runs no
 * ads, the banner never offers a choice about them, and a declaration that
 * claimed a permission nobody was ever asked for is the one thing worse than
 * measuring less.
 */
function inlineTag(measurementId: string): string {
  return `
window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
var c = (document.cookie.match(/(?:^|; )tl_consent=([^;]*)/) || [])[1] || '';
gtag('consent', 'default', {
  ad_storage: 'denied',
  ad_user_data: 'denied',
  ad_personalization: 'denied',
  analytics_storage: c.includes('analytics:granted') ? 'granted' : 'denied'
});
gtag('config', ${JSON.stringify(measurementId)});
`.trim();
}

/**
 * Google's own tag, installed the way Google documents it.
 *
 * The library talks to the tag that is already on the page and never injects
 * it, so this is the host's job and it lives here, in the host. It is also the
 * command that reports the landing page: everything after it is a navigation,
 * which is why the page view on route changes skips its first run.
 *
 * Renders nothing without a measurement id, which is every environment but the
 * deployed site.
 */
export function GoogleTag(): ReactNode {
  if (!ga4MeasurementId) return null;

  return (
    <>
      <script
        // biome-ignore lint/security/noDangerouslySetInnerHtml: the vendor snippet has no other insertion point
        dangerouslySetInnerHTML={{ __html: inlineTag(ga4MeasurementId) }}
      />
      <script
        async
        src={`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(ga4MeasurementId)}`}
      />
    </>
  );
}
