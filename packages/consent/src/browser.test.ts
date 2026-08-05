import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cookieStorage, createConsent, selectProviders } from './browser.js';

/**
 * A minimal `document.cookie` stand-in: reading returns every stored pair
 * joined the way a browser does, writing upserts one pair, and `max-age=0`
 * deletes it. Good enough to exercise `cookieStorage` without pulling in
 * jsdom, the same way `ga4.browser.test.ts` stubs `window` for `gtag`.
 */
function fakeDocument(): { cookie: string } {
  const jar = new Map<string, string>();

  return {
    get cookie() {
      return [...jar].map(([name, value]) => `${name}=${value}`).join('; ');
    },
    set cookie(raw: string) {
      const [pair, ...attributes] = raw.split(';').map((part) => part.trim());
      const separator = pair?.indexOf('=') ?? -1;
      if (!pair || separator < 0) return;

      const name = pair.slice(0, separator);
      const value = pair.slice(separator + 1);
      const maxAge = attributes.find((attr) => attr.toLowerCase().startsWith('max-age='));

      if (maxAge && Number(maxAge.split('=')[1]) <= 0) {
        jar.delete(name);
      } else {
        jar.set(name, value);
      }
    },
  };
}

beforeEach(() => {
  vi.stubGlobal('document', fakeDocument());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('cookieStorage', () => {
  it('reads null before anything was written', () => {
    expect(cookieStorage().read()).toBeNull();
  });

  it('round-trips a written value', () => {
    const storage = cookieStorage();

    storage.write('analytics:granted|marketing:denied');

    expect(storage.read()).toBe('analytics:granted|marketing:denied');
  });

  it('writes the value unencoded, readable verbatim', () => {
    const storage = cookieStorage();
    storage.write('analytics:granted|marketing:denied');

    expect(document.cookie).toContain('analytics:granted|marketing:denied');
  });

  it('uses its own cookie name, defaulting to tl_consent', () => {
    cookieStorage().write('analytics:granted');

    expect(document.cookie).toContain('tl_consent=');
  });

  it('honours a custom name, scoping reads and writes to it', () => {
    const storage = cookieStorage({ name: 'acme_consent' });
    storage.write('marketing:granted');

    expect(document.cookie).toContain('acme_consent=marketing:granted');
    expect(storage.read()).toBe('marketing:granted');
  });

  it('forgets the record, returning read() to null', () => {
    const storage = cookieStorage();
    storage.write('analytics:granted');
    expect(storage.read()).not.toBeNull();

    storage.forget();

    expect(storage.read()).toBeNull();
  });
});

describe('createConsent — the unanswered state', () => {
  it('reports answered: false with no stored cookie', () => {
    const consent = createConsent({ categories: { analytics: 'granted', marketing: 'denied' } });

    expect(consent.answered).toBe(false);
  });

  it('holds the configured defaults as state before an answer', () => {
    const consent = createConsent({ categories: { analytics: 'granted', marketing: 'denied' } });

    expect(consent.state).toEqual({ analytics: 'granted', marketing: 'denied' });
  });
});

describe('createConsent — reading a stored answer', () => {
  it('reflects a well-formed stored cookie in state and answered', () => {
    const storage = cookieStorage();
    storage.write('analytics:denied|marketing:granted');

    const consent = createConsent({
      categories: { analytics: 'granted', marketing: 'granted' },
      storage,
    });

    expect(consent.answered).toBe(true);
    expect(consent.state).toEqual({ analytics: 'denied', marketing: 'granted' });
  });

  it('tolerates a malformed cookie: bad pairs are skipped, not thrown', () => {
    const storage = cookieStorage();
    storage.write('analytics:maybe|garbage|marketing:granted');

    expect(() =>
      createConsent({
        categories: { analytics: 'denied', marketing: 'denied' },
        storage,
      }),
    ).not.toThrow();

    const consent = createConsent({
      categories: { analytics: 'denied', marketing: 'denied' },
      storage,
    });

    // The malformed `analytics:maybe` pair falls back to the configured
    // default; the well-formed `marketing:granted` pair is honoured.
    expect(consent.state).toEqual({ analytics: 'denied', marketing: 'granted' });
  });

  it('ignores a category the cookie names that the host never configured', () => {
    const storage = cookieStorage();
    storage.write('analytics:granted|unknown_category:granted');

    const consent = createConsent({ categories: { analytics: 'denied' }, storage });

    expect(consent.state).toEqual({ analytics: 'granted' });
  });
});

describe('createConsent — answering', () => {
  it('stores the full record and flips answered to true', () => {
    const storage = cookieStorage();
    const consent = createConsent({
      categories: { analytics: 'denied', marketing: 'denied' },
      storage,
    });

    consent.answer({ analytics: 'granted', marketing: 'denied' });

    expect(consent.answered).toBe(true);
    expect(consent.state).toEqual({ analytics: 'granted', marketing: 'denied' });
    expect(storage.read()).toBe('analytics:granted|marketing:denied');
  });

  it('notifies subscribers with the new state', () => {
    const consent = createConsent({ categories: { analytics: 'denied', marketing: 'denied' } });
    const listener = vi.fn();
    consent.subscribe(listener);

    consent.answer({ analytics: 'granted', marketing: 'granted' });

    expect(listener).toHaveBeenCalledWith({ analytics: 'granted', marketing: 'granted' });
  });

  it('stops notifying once unsubscribed', () => {
    const consent = createConsent({ categories: { analytics: 'denied', marketing: 'denied' } });
    const listener = vi.fn();
    const unsubscribe = consent.subscribe(listener);
    unsubscribe();

    consent.answer({ analytics: 'granted', marketing: 'granted' });

    expect(listener).not.toHaveBeenCalled();
  });

  it('keeps state referentially stable between reads', () => {
    const consent = createConsent({ categories: { analytics: 'denied', marketing: 'denied' } });

    expect(consent.state).toBe(consent.state);
  });
});

describe('createConsent — forgetting', () => {
  it('erases the record and returns to unanswered', () => {
    const storage = cookieStorage();
    const consent = createConsent({
      categories: { analytics: 'denied', marketing: 'denied' },
      storage,
    });
    consent.answer({ analytics: 'granted', marketing: 'granted' });

    consent.forget();

    expect(consent.answered).toBe(false);
    expect(storage.read()).toBeNull();
  });

  it('resets to the configured defaults, not to all-denied', () => {
    const consent = createConsent({ categories: { analytics: 'granted', marketing: 'denied' } });
    consent.answer({ analytics: 'denied', marketing: 'denied' });

    consent.forget();

    // The visible cost of the decision: a granted default comes back. That is
    // what "before answering" means, and why forget is not withdrawal.
    expect(consent.state).toEqual({ analytics: 'granted', marketing: 'denied' });
  });

  it('notifies subscribers, so a live provider list can recompose', () => {
    const consent = createConsent({ categories: { analytics: 'granted', marketing: 'denied' } });
    consent.answer({ analytics: 'denied', marketing: 'denied' });
    const listener = vi.fn();
    consent.subscribe(listener);

    consent.forget();

    expect(listener).toHaveBeenCalledWith({ analytics: 'granted', marketing: 'denied' });
  });
});

describe('selectProviders', () => {
  const state = { analytics: 'granted', marketing: 'denied' } as const;

  it('always includes a bare provider', () => {
    expect(selectProviders(state, ['ga4'])).toEqual(['ga4']);
  });

  it('includes a wrapped provider when its single needs category is granted', () => {
    expect(selectProviders(state, [{ provider: 'posthog', needs: 'analytics' }])).toEqual([
      'posthog',
    ]);
  });

  it('excludes a wrapped provider when its single needs category is denied', () => {
    expect(selectProviders(state, [{ provider: 'meta', needs: 'marketing' }])).toEqual([]);
  });

  it('requires every category in a needs array to be granted', () => {
    expect(
      selectProviders(state, [{ provider: 'meta', needs: ['analytics', 'marketing'] }]),
    ).toEqual([]);

    expect(selectProviders(state, [{ provider: 'ga4', needs: ['analytics'] }])).toEqual(['ga4']);
  });

  it('mixes bare and wrapped entries, preserving order', () => {
    expect(
      selectProviders(state, [
        'ga4',
        { provider: 'meta', needs: 'marketing' },
        { provider: 'posthog', needs: 'analytics' },
      ]),
    ).toEqual(['ga4', 'posthog']);
  });
});
