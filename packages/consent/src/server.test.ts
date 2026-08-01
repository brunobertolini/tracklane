import { describe, expect, it } from 'vitest';
import { readConsent, selectProviders } from './server.js';

const categories = { analytics: 'granted', marketing: 'granted' } as const;

describe('readConsent — the unanswered state', () => {
  it('reports answered: false when no cookies are given', () => {
    expect(readConsent(null, { categories }).answered).toBe(false);
    expect(readConsent(undefined, { categories }).answered).toBe(false);
  });

  it('reports answered: false when the named cookie is absent', () => {
    const { state, answered } = readConsent('other_cookie=1', { categories });

    expect(answered).toBe(false);
    expect(state).toEqual({ analytics: 'granted', marketing: 'granted' });
  });
});

describe('readConsent — reading a cookie header', () => {
  it('accepts a raw Cookie header string', () => {
    const { state, answered } = readConsent('tl_consent=analytics:denied|marketing:granted', {
      categories,
    });

    expect(answered).toBe(true);
    expect(state).toEqual({ analytics: 'denied', marketing: 'granted' });
  });

  it('accepts an already-parsed cookie map', () => {
    const { state, answered } = readConsent(
      { tl_consent: 'analytics:denied|marketing:denied' },
      { categories },
    );

    expect(answered).toBe(true);
    expect(state).toEqual({ analytics: 'denied', marketing: 'denied' });
  });

  it('honours a custom cookie name', () => {
    const { state } = readConsent(
      { acme_consent: 'analytics:denied|marketing:granted' },
      { categories, name: 'acme_consent' },
    );

    expect(state).toEqual({ analytics: 'denied', marketing: 'granted' });
  });

  it('tolerates a malformed cookie value: bad pairs are skipped, not thrown', () => {
    expect(() =>
      readConsent('tl_consent=analytics:maybe|garbage|marketing:granted', { categories }),
    ).not.toThrow();

    const { state } = readConsent('tl_consent=analytics:maybe|garbage|marketing:granted', {
      categories,
    });

    expect(state).toEqual({ analytics: 'granted', marketing: 'granted' });
  });

  it('ignores a category the cookie names that the host never configured', () => {
    const { state } = readConsent('tl_consent=analytics:denied|unknown_category:granted', {
      categories: { analytics: 'granted' },
    });

    expect(state).toEqual({ analytics: 'denied' });
  });
});

describe('selectProviders (re-exported for the server half)', () => {
  it('is the same pure filter as the browser half', () => {
    const state = { analytics: 'granted', marketing: 'denied' } as const;

    expect(selectProviders(state, ['ga4', { provider: 'meta', needs: 'marketing' }])).toEqual([
      'ga4',
    ]);
  });
});
