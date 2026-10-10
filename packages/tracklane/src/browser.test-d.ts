import { expectTypeOf, it } from 'vitest';
import { ga4 } from './browser.js';
import type { BrowserProvider, EventData, TrackOptions } from './index.js';

it('keeps three-argument providers and calls compatible with optional warnings', () => {
  const legacy = {
    name: 'custom',
    default: 'passthrough' as const,
    track(_name: string, _data: EventData, _options: TrackOptions): void {},
  };
  expectTypeOf(legacy).toExtend<BrowserProvider>();
  const provider: BrowserProvider = legacy;
  provider.track('purchase', {}, {});
  provider.track('purchase', {}, {}, (message) => {
    expectTypeOf(message).toEqualTypeOf<string>();
  });
});

it('accepts default routing and preserves explicit GA4 destination calls', () => {
  expectTypeOf(ga4()).toEqualTypeOf<BrowserProvider>();
  expectTypeOf(ga4({ events: { checkout: 'begin_checkout' } })).toEqualTypeOf<BrowserProvider>();
  expectTypeOf(ga4('G-ABC')).toEqualTypeOf<BrowserProvider>();
  expectTypeOf(ga4('G-ABC', { events: { internal: null } })).toEqualTypeOf<BrowserProvider>();
  // @ts-expect-error A destination is a string, not a numeric ID.
  ga4(123);
  // @ts-expect-error The config-only form does not take a second configuration.
  ga4({}, {});
});
