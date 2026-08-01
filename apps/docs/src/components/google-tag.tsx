import type { ReactNode } from 'react';
import { ga4MeasurementId } from '@/lib/analytics';

/**
 * The consent declaration and the property configuration, in one block, in
 * that order, because Google requires the declaration before any measurement.
 *
 * Everything is denied, including analytics, and nothing here ever grants it.
 * There is no way to ask on this site yet, and a declaration that claims a
 * permission nobody gave is the one thing worse than measuring less: the tag
 * runs cookieless, counts page views without storing anything on the device,
 * and the numbers are modelled rather than exact. That is the honest reading
 * of a site with no question on it.
 *
 * The advertising signals are denied because this site runs no ads, which is
 * a fact about the site rather than an answer standing in for a visitor's.
 */
function inlineTag(measurementId: string): string {
  return `
window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('consent', 'default', {
  ad_storage: 'denied',
  ad_user_data: 'denied',
  ad_personalization: 'denied',
  analytics_storage: 'denied'
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
