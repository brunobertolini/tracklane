import type { BrowserProvider } from 'tracklane';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { consentedTracking } from './tracklane.js';

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
  it('derives its categories from the region, unanswered at first', () => {
    // DE is surveyed opt-in with both purposes denied by default.
    const { consent } = consentedTracking({ region: 'DE', providers: [] });

    expect(consent.answered).toBe(false);
    expect(consent.state).toEqual({ analytics: 'denied', marketing: 'denied' });
  });

  it('excludes a gated provider while its category is denied by default', () => {
    const always = fakeProvider('always');
    const gated = fakeProvider('gated');

    const { track } = consentedTracking({
      region: 'DE',
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
      region: 'DE',
      providers: [always, { provider: gated, needs: 'marketing' }],
    });

    track('purchase');
    expect(gated.track).not.toHaveBeenCalled();

    consent.answer({ analytics: 'denied', marketing: 'granted' });
    track('purchase');

    expect(gated.track).toHaveBeenCalledOnce();
  });

  it('flips answered to true and updates state on answer', () => {
    const { consent } = consentedTracking({ region: 'DE', providers: [] });

    consent.answer({ analytics: 'granted', marketing: 'denied' });

    expect(consent.answered).toBe(true);
    expect(consent.state).toEqual({ analytics: 'granted', marketing: 'denied' });
  });

  it('forwards a translated consent(update) to every provider present after the rebuild', () => {
    const always = fakeProvider('always', { consent: vi.fn() });

    const { consent } = consentedTracking({ region: 'DE', providers: [always] });

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

    consentedTracking({ region: 'DE', providers: [always] });

    expect(always.consent).not.toHaveBeenCalled();
  });

  it('delegates identify to the current instance', () => {
    const always = fakeProvider('always', { identify: vi.fn() });

    const { identify } = consentedTracking({ region: 'DE', providers: [always] });
    identify({ userId: 'u-1' });

    expect(always.identify).toHaveBeenCalledWith({ userId: 'u-1' }, undefined);
  });

  it('keeps track and identify stable across a rebuild', () => {
    const result = consentedTracking({ region: 'DE', providers: [fakeProvider('always')] });
    const { track, identify } = result;

    result.consent.answer({ analytics: 'granted', marketing: 'granted' });

    expect(result.track).toBe(track);
    expect(result.identify).toBe(identify);
  });

  it('runs uneventfully under an opt-out region, where measurement starts granted', () => {
    const always = fakeProvider('always');

    const { track, consent } = consentedTracking({ region: 'BR', providers: [always] });
    expect(consent.state).toEqual({ analytics: 'granted', marketing: 'granted' });

    track('purchase');

    expect(always.track).toHaveBeenCalledOnce();
  });
});
