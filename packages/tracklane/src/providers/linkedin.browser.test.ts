import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTracking, linkedin } from '../browser.js';
import { conformsAsBrowserProvider } from '../conformance.js';

let calls: unknown[][];
beforeEach(() => {
  calls = [];
  vi.stubGlobal('window', { lintrk: (...args: unknown[]) => calls.push(args) });
});
afterEach(() => vi.unstubAllGlobals());

it('sends the mapped conversion ID and documented fields, preserving zero and the input', () => {
  const data = {
    value: 0,
    currency: 'BRL',
    transaction_id: 'order-1',
    items: [{ item_name: 'A' }],
    custom: 'private',
  };
  const before = JSON.stringify(data);
  createTracking({ providers: [linkedin({ events: { purchase: '12345' } })] }).track(
    'purchase',
    data,
    { dedupId: 'order-1' },
  );
  expect(calls).toEqual([
    [
      'track',
      {
        conversion_id: 12345,
        conversion_currency: 'BRL',
        conversion_value: 0,
        event_id: 'order-1',
      },
    ],
  ]);
  expect(JSON.stringify(data)).toBe(before);
});

it('does not invent value, currency, deduplication, identify or consent commands', () => {
  const provider = linkedin({ events: { purchase: '12345' } });
  provider.track('12345', {}, {});
  expect(calls).toEqual([['track', { conversion_id: 12345 }]]);
  expect(provider.identify).toBeUndefined();
  expect(provider.consent).toBeUndefined();
  expect(provider.install).toBeUndefined();
});

it('reports absent mappings but keeps intentional null exclusions silent', () => {
  const errors: unknown[] = [];
  const tracking = createTracking({
    providers: [linkedin({ events: { internal: null } })],
    onError: (error) => errors.push(error),
  });
  tracking.track('purchase');
  tracking.track('internal');
  expect(calls).toEqual([]);
  expect(errors).toEqual([
    expect.objectContaining({ provider: 'linkedin', event: 'purchase', severity: 'warning' }),
  ]);
});

it('isolates a throwing mapping reporter and continues to other providers', () => {
  const other = vi.fn();
  createTracking({
    providers: [linkedin({ events: {} }), { name: 'other', default: 'passthrough', track: other }],
    onError: () => {
      throw new Error('logger');
    },
  }).track('purchase');
  expect(other).toHaveBeenCalledOnce();
});

it('reports a missing host snippet and invalid conversion IDs', () => {
  vi.stubGlobal('window', {});
  expect(() => linkedin({ events: {} }).track('12345', {}, {})).toThrow(/lintrk/);
  for (const id of ['purchase', '0', '-1', '1.5', '9007199254740993']) {
    expect(() => linkedin({ events: {} }).track(id, {}, {})).toThrow(/conversion_id/);
  }
});

describe('linkedin browser conformance', () => {
  conformsAsBrowserProvider({
    create: () => linkedin({ events: { purchase: '12345' } }),
    target: '12345',
    captured: () => calls,
    reset: () => {
      calls = [];
    },
  });
});
