import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ga4 } from './ga4.browser.js';

let calls: unknown[][];

beforeEach(() => {
  calls = [];
  vi.stubGlobal('window', {
    gtag: (...args: unknown[]) => {
      calls.push(args);
    },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('ga4 browser', () => {
  it('sends the canonical name and data unchanged', () => {
    // The canonical vocabulary already is GA4's, which is why this vendor
    // ships no event map at all.
    ga4('G-ABC').track('purchase', { value: 10, currency: 'BRL' }, {});

    expect(calls).toContainEqual([
      'event',
      'purchase',
      { value: 10, currency: 'BRL', send_to: 'G-ABC' },
    ]);
  });

  it('addresses the configured property on every event', () => {
    // Without send_to, gtag sends to every property configured on the page,
    // including one a tag manager owns and we were never meant to feed.
    ga4('G-ABC').track('purchase', {}, {});

    expect(calls[0]?.[2]).toMatchObject({ send_to: 'G-ABC' });
  });

  it('wins over a send_to the host put in the event data', () => {
    ga4('G-ABC').track('purchase', { send_to: 'G-SOMEONE-ELSE' }, {});

    expect(calls[0]?.[2]).toMatchObject({ send_to: 'G-ABC' });
  });

  it('sends the dedup id nowhere at all', () => {
    // GA4 documents no browser-to-server deduplication. A synthetic param
    // would imply a semantics the platform does not have, letting a host
    // believe a double-send is safe while it double-counts.
    ga4('G-ABC').track('purchase', { value: 1 }, { dedupId: 'order-1' });

    expect(JSON.stringify(calls)).not.toContain('order-1');
  });

  it('forwards consent verbatim, because the vocabulary is already Google’s', () => {
    ga4('G-ABC').consent?.('update', { ad_storage: 'granted', analytics_storage: 'denied' });

    expect(calls).toContainEqual([
      'consent',
      'update',
      { ad_storage: 'granted', analytics_storage: 'denied' },
    ]);
  });

  it('passes an undeclared signal along as absent, never as denied', () => {
    // Turning silence into a denial puts words in the visitor's mouth just
    // as turning it into a grant would.
    ga4('G-ABC').consent?.('default', { ad_storage: 'denied' });

    expect(calls[0]?.[2]).toEqual({ ad_storage: 'denied' });
  });

  it('sets the user id on identify', () => {
    ga4('G-ABC').identify?.({ userId: 'u-1' }, { plan: 'pro' });

    expect(calls).toContainEqual(['set', { user_id: 'u-1' }]);
    expect(calls).toContainEqual(['set', 'user_properties', { plan: 'pro' }]);
  });

  it('sends no identifier GA4 has no slot for', () => {
    // Inventing a destination would look mapped and arrive nowhere.
    ga4('G-ABC').identify?.({ email: 'ana@example.com', phone: '+5511999999999' });

    expect(JSON.stringify(calls)).not.toContain('ana@example.com');
    expect(JSON.stringify(calls)).not.toContain('5511999999999');
  });

  it('never installs anything on the page', () => {
    // The tag belongs to the host. This library does not inject third-party
    // scripts, and it does not configure the property. A second
    // configuration would emit a second page view on every load.
    expect(ga4('G-ABC').install).toBeUndefined();
  });

  it('fails loudly when the tag is missing, the way a hand-written call would', () => {
    // A silent no-op is how a host ends up believing it is measuring
    // something. The dispatcher turns this into an onError report.
    vi.stubGlobal('window', {});

    expect(() => ga4('G-ABC').track('purchase', {}, {})).toThrow(/gtag/);
  });

  it('fails the same way when there is no browser at all', () => {
    vi.stubGlobal('window', undefined);

    expect(() => ga4('G-ABC').track('purchase', {}, {})).toThrow(/gtag/);
  });
});
