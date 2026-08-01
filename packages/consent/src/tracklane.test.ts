import type { BrowserProvider } from 'tracklane';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { consentedTracking } from './tracklane.js';
import type { ConsentDecision } from './vocabulary.js';

/**
 * The two shapes the tests need, written out rather than surveyed. Typed
 * rather than `as const` so the category union comes from here and not from
 * whichever `needs` a given test happens to use.
 */
type Canonical = Record<'analytics' | 'marketing', ConsentDecision>;
const STRICT: Canonical = { analytics: 'denied', marketing: 'denied' };
const PERMISSIVE: Canonical = { analytics: 'granted', marketing: 'granted' };

/** Same minimal `document.cookie` stand-in as `browser.test.ts`. */
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

function fakeProvider(name: string, over: Partial<BrowserProvider> = {}): BrowserProvider {
  return { name, default: 'passthrough', track: vi.fn(), ...over };
}

beforeEach(() => {
  vi.stubGlobal('document', fakeDocument());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('consentedTracking', () => {
  it('starts from the configured defaults, unanswered', () => {
    const { consent } = consentedTracking({ categories: STRICT, providers: [] });

    expect(consent.answered).toBe(false);
    expect(consent.state).toEqual({ analytics: 'denied', marketing: 'denied' });
  });

  it('excludes a gated provider while its category is denied by default', () => {
    const always = fakeProvider('always');
    const gated = fakeProvider('gated');

    const { track } = consentedTracking({
      categories: STRICT,
      providers: [always, { provider: gated, needs: 'marketing' }],
    });

    track('purchase', { value: 10 });

    expect(always.track).toHaveBeenCalledOnce();
    expect(gated.track).not.toHaveBeenCalled();
  });

  it('rebuilds on answer, so a newly-granted provider is included afterwards', () => {
    const always = fakeProvider('always');
    const gated = fakeProvider('gated');

    const { track, consent } = consentedTracking({
      categories: STRICT,
      providers: [always, { provider: gated, needs: 'marketing' }],
    });

    track('purchase');
    expect(gated.track).not.toHaveBeenCalled();

    consent.answer({ analytics: 'denied', marketing: 'granted' });
    track('purchase');

    expect(gated.track).toHaveBeenCalledOnce();
  });

  it('flips answered to true and updates state on answer', () => {
    const { consent } = consentedTracking({ categories: STRICT, providers: [] });

    consent.answer({ analytics: 'granted', marketing: 'denied' });

    expect(consent.answered).toBe(true);
    expect(consent.state).toEqual({ analytics: 'granted', marketing: 'denied' });
  });

  it('forwards a translated consent(update) to every provider present after the rebuild', () => {
    const always = fakeProvider('always', { consent: vi.fn() });

    const { consent } = consentedTracking({ categories: STRICT, providers: [always] });

    consent.answer({ analytics: 'granted', marketing: 'denied' });

    expect(always.consent).toHaveBeenCalledWith('update', {
      analytics_storage: 'granted',
      ad_storage: 'denied',
      ad_user_data: 'denied',
      ad_personalization: 'denied',
    });
  });

  it('never calls consent(update) before an answer', () => {
    const always = fakeProvider('always', { consent: vi.fn() });

    consentedTracking({ categories: STRICT, providers: [always] });

    expect(always.consent).not.toHaveBeenCalled();
  });

  it('delegates identify to the current instance', () => {
    const always = fakeProvider('always', { identify: vi.fn() });

    const { identify } = consentedTracking({ categories: STRICT, providers: [always] });
    identify({ userId: 'u-1' });

    expect(always.identify).toHaveBeenCalledWith({ userId: 'u-1' }, undefined);
  });

  it('keeps track and identify stable across a rebuild', () => {
    const result = consentedTracking({ categories: STRICT, providers: [fakeProvider('always')] });
    const { track, identify } = result;

    result.consent.answer({ analytics: 'granted', marketing: 'granted' });

    expect(result.track).toBe(track);
    expect(result.identify).toBe(identify);
  });

  it('runs from the first event when the defaults already grant', () => {
    const always = fakeProvider('always');

    const { track, consent } = consentedTracking({ categories: PERMISSIVE, providers: [always] });
    expect(consent.state).toEqual({ analytics: 'granted', marketing: 'granted' });

    track('purchase');

    expect(always.track).toHaveBeenCalledOnce();
  });

  it('takes the host own collapse when the categories are not the canonical two', () => {
    const always = fakeProvider('always', { consent: vi.fn() });

    const { consent } = consentedTracking({
      categories: { stats: 'denied' },
      providers: [always],
      consent: (state) => ({ analytics_storage: state.stats }),
    });

    consent.answer({ stats: 'granted' });

    expect(always.consent).toHaveBeenCalledWith('update', { analytics_storage: 'granted' });
  });

  it('sends no signal a category did not name', () => {
    const always = fakeProvider('always', { consent: vi.fn() });

    // Without `marketing` there is nothing to say about advertising, and
    // widening silence into a grant is the one thing this must never do.
    const { consent } = consentedTracking({
      categories: { analytics: 'denied' },
      providers: [always],
    });

    consent.answer({ analytics: 'granted' });

    expect(always.consent).toHaveBeenCalledWith('update', { analytics_storage: 'granted' });
  });
});
