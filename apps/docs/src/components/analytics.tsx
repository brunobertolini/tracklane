'use client';

import type { ConsentedTracking } from '@tracklane/consent/tracklane';
import { consentedTracking } from '@tracklane/consent/tracklane';
import type { ConsentPurpose } from '@tracklane/consent-rules';
import { rulesFor } from '@tracklane/consent-rules';
import { usePathname } from 'next/navigation';
import { useEffect, useRef } from 'react';
import { ga4 } from 'tracklane/browser';
import { consentRegion, ga4MeasurementId } from '@/lib/analytics';

/**
 * This site, measured with the library it documents, wired to a consent
 * banner through `@tracklane/consent/tracklane`.
 *
 * Built once at module scope, which is the same shape a host would write: one
 * instance for the page, created before anything has an event to send. With no
 * measurement id there are no providers, so `track` is a loop over nothing and
 * the site behaves identically without a single conditional at the call sites.
 *
 * GA4 is the only vendor here and it is a bare entry, not a wrapped one: it
 * has its own consent command (ADR-0006) and stays configured regardless of
 * the answer, reading `consent.state` to decide whether it runs cookied or
 * modelled. There is no `needs` to declare for it.
 */
export const tracking: ConsentedTracking<ConsentPurpose> = consentedTracking({
  // The region picks the defaults and stops there: `consentedTracking` takes
  // categories and never learns a jurisdiction exists.
  categories: rulesFor(consentRegion).defaults,
  providers: ga4MeasurementId ? [ga4(ga4MeasurementId)] : [],
  // The console is the only channel a static site has. It is noisy when an
  // extension blocks the tag, and that noise is the point: a send that never
  // arrives should be visible somewhere rather than believed.
  onError: (error) => {
    console.error(`[analytics] ${error.provider}/${error.event}: ${error.message}`);
  },
});

/**
 * A page view for every navigation after the first.
 *
 * Google's tag already reported the page the visitor landed on, as part of
 * configuring the property. Reporting it again here is the duplicate page view
 * that reads as twice the traffic, so the first run is skipped. The title is
 * left to the tag, which reads it when the hit is sent.
 */
export function PageViews(): null {
  const pathname = usePathname();
  const landing = useRef(true);

  // biome-ignore lint/correctness/useExhaustiveDependencies: the path is what this reports, not a value read here
  useEffect(() => {
    if (landing.current) {
      landing.current = false;
      return;
    }

    tracking.track('page_view', { page_location: window.location.href });
  }, [pathname]);

  return null;
}
