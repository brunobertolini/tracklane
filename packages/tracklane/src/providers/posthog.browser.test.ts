import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { conformsAsBrowserProvider } from '../conformance.js';
import { posthog } from './posthog.browser.js';

let calls: unknown[][];

function record(method: string) {
  return (...args: unknown[]): void => {
    calls.push([method, ...args]);
  };
}

beforeEach(() => {
  calls = [];
  vi.stubGlobal('window', {
    posthog: {
      capture: record('capture'),
      identify: record('identify'),
      setPersonProperties: record('setPersonProperties'),
      opt_in_capturing: record('opt_in_capturing'),
      opt_out_capturing: record('opt_out_capturing'),
    },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('posthog browser', () => {
  it('sends the canonical name and data unchanged', () => {
    // capture() accepts any string, which is why this vendor ships no event
    // map at all.
    posthog().track('purchase', { value: 10, currency: 'BRL' }, {});

    expect(calls).toContainEqual(['capture', 'purchase', { value: 10, currency: 'BRL' }]);
  });

  it('sends the dedup id nowhere at all', () => {
    // The Capture API documents no deduplication key. A synthetic param
    // would imply a semantics PostHog does not have.
    posthog().track('purchase', { value: 1 }, { dedupId: 'order-1' });

    expect(JSON.stringify(calls)).not.toContain('order-1');
  });

  it('identifies the distinct_id on identify', () => {
    posthog().identify?.({ userId: 'u-1' });

    expect(calls).toContainEqual(['identify', 'u-1']);
  });

  it('sets person properties independently of an id', () => {
    // setPersonProperties works against whichever identity is already
    // current, so traits travel even when no userId was given.
    posthog().identify?.({}, { plan: 'pro' });

    expect(calls).toContainEqual(['setPersonProperties', { plan: 'pro' }]);
    expect(calls.some((call) => call[0] === 'identify')).toBe(false);
  });

  it('sends no identifier PostHog has no slot for', () => {
    // Inventing a destination would look mapped and arrive nowhere.
    posthog().identify?.({ email: 'ana@example.com', phone: '+5511999999999' });

    expect(JSON.stringify(calls)).not.toContain('ana@example.com');
    expect(JSON.stringify(calls)).not.toContain('5511999999999');
  });

  it('opts out when analytics_storage is denied', () => {
    posthog().consent?.('update', { analytics_storage: 'denied' });

    expect(calls).toContainEqual(['opt_out_capturing']);
  });

  it('opts in when analytics_storage is granted', () => {
    posthog().consent?.('update', { analytics_storage: 'granted' });

    expect(calls).toContainEqual(['opt_in_capturing']);
  });

  it('fires no command when analytics_storage was not declared', () => {
    // Google's ad-only signals have no honest PostHog equivalent. Silence
    // stays silence rather than being folded into a switch this vendor does
    // not have a matching concept for.
    posthog().consent?.('update', { ad_storage: 'denied' });

    expect(calls).toEqual([]);
  });

  it('never installs anything on the page', () => {
    // The snippet belongs to the host. This library does not inject
    // third-party scripts.
    expect(posthog().install).toBeUndefined();
  });

  it('fails loudly when the snippet is missing, the way a hand-written call would', () => {
    vi.stubGlobal('window', {});

    expect(() => posthog().track('purchase', {}, {})).toThrow(/posthog/);
  });

  it('fails the same way when there is no browser at all', () => {
    vi.stubGlobal('window', undefined);

    expect(() => posthog().track('purchase', {}, {})).toThrow(/posthog/);
  });
});

// The invariants every provider owes, run against this one. What PostHog
// sends and how it spells it is above; this is the part that must hold for a
// provider written by somebody else, for a vendor nobody here has heard of.
describe('posthog browser conformance', () => {
  conformsAsBrowserProvider({
    create: () => posthog(),
    captured: () => calls,
    reset: () => {
      calls = [];
    },
  });
});
