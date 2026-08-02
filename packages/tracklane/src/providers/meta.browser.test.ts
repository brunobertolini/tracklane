import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { conformsAsBrowserProvider } from '../conformance.js';
import { meta } from './meta.browser.js';

let calls: unknown[][];

beforeEach(() => {
  calls = [];
  vi.stubGlobal('window', {
    fbq: (...args: unknown[]) => {
      calls.push(args);
    },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('meta browser', () => {
  it('spells the canonical vocabulary the way Meta does', () => {
    // The canonical names are GA4's, so unlike GA4 this vendor ships a map.
    expect(meta().events).toMatchObject({
      purchase: 'Purchase',
      view_item: 'ViewContent',
      begin_checkout: 'InitiateCheckout',
      sign_up: 'CompleteRegistration',
      generate_lead: 'Lead',
      page_view: 'PageView',
    });
  });

  it('leaves a canonical event Meta has no standard name for unmapped', () => {
    // Unmapped under `passthrough` means it reaches `track` under its own
    // name and goes out as a custom event. Guessing `ViewContent` for
    // `select_content` would be the library inventing a translation.
    const { events } = meta();

    expect(events?.refund).toBeUndefined();
    expect(events?.login).toBeUndefined();
    expect(events?.select_content).toBeUndefined();
    expect(meta().default).toBe('passthrough');
  });

  it('lets the host reach the standard events GA4 has no name for', () => {
    expect(meta({ events: { subscribe: 'Subscribe' } }).events).toMatchObject({
      subscribe: 'Subscribe',
      purchase: 'Purchase',
    });
  });

  it('lets the host keep an event out of Meta entirely', () => {
    expect(meta({ events: { purchase: null } }).events?.purchase).toBeNull();
  });

  it('sends a standard event through the documented track command', () => {
    // `track`, not `trackSingle`: it is what a hand-written call is, and the
    // only form Meta documents the deduplication object for. `trackSingle`
    // would address one pixel, at the cost of an undocumented placement for
    // the one value deduplication depends on.
    meta().track('Purchase', { value: 10, currency: 'BRL' }, {});

    expect(calls).toContainEqual(['track', 'Purchase', { value: 10, currency: 'BRL' }]);
  });

  it('sends anything else through the custom-event command', () => {
    // A different command, not a different argument: `fbq('track', 'refund')`
    // is not a thing Meta accepts.
    meta().track('refund', { value: 10 }, {});

    expect(calls).toContainEqual(['trackCustom', 'refund', { value: 10 }]);
  });

  it('takes no pixel id, because track reaches every pixel on the page', () => {
    // A parameter that addressed nothing would promise what this command
    // cannot deliver. Which pixels exist is the snippet's `fbq('init')`.
    expect(meta.length).toBe(0);
  });

  it('translates GA4 items into Meta contents', () => {
    meta().track(
      'Purchase',
      { items: [{ item_id: 'SKU-1', item_name: 'Shoe', price: 25, quantity: 2 }] },
      {},
    );

    // `item_name` has no home inside `contents`. Forwarding it would look
    // mapped and arrive nowhere.
    expect(calls[0]?.[2]).toEqual({ contents: [{ id: 'SKU-1', quantity: 2, item_price: 25 }] });
  });

  it('passes through what the host named itself', () => {
    // A business measures things this vocabulary does not name, and Meta
    // keeps unknown keys as custom properties.
    meta().track('Purchase', { value: 1, coupon: 'WELCOME' }, {});

    expect(calls[0]?.[2]).toMatchObject({ coupon: 'WELCOME' });
  });

  it('leaves the order id under its own name on this surface', () => {
    // `order_id` is documented on the Conversions API and not among the
    // pixel's object properties. Translating it here would invent a slot.
    meta().track('Purchase', { transaction_id: 'T-1' }, {});

    expect(calls[0]?.[2]).toEqual({ transaction_id: 'T-1' });
  });

  it('carries the dedup id under the name this surface uses', () => {
    // `eventID` in the browser, `event_id` on the Conversions API, matched
    // together with the event name.
    meta().track('Purchase', { value: 1 }, { dedupId: 'T-1' });

    expect(calls[0]?.[3]).toEqual({ eventID: 'T-1' });
  });

  it('sends no deduplication object when it was given no value', () => {
    meta().track('Purchase', { value: 1 }, {});

    expect(calls[0]).toHaveLength(3);
  });

  it('grants only when every declared signal was granted', () => {
    meta().consent?.('update', {
      ad_storage: 'granted',
      analytics_storage: 'granted',
      ad_user_data: 'granted',
      ad_personalization: 'granted',
    });

    expect(calls).toContainEqual(['consent', 'grant']);
  });

  it('collapses to the strictest declared answer', () => {
    // Meta has one switch where this library carries four signals. Any other
    // reduction would widen a denial into a grant.
    meta().consent?.('update', { ad_storage: 'granted', analytics_storage: 'denied' });

    expect(calls).toContainEqual(['consent', 'revoke']);
  });

  it('says nothing when the host declared nothing', () => {
    // Reading silence as either answer puts words in the visitor's mouth.
    meta().consent?.('update', {});

    expect(calls).toEqual([]);
  });

  it('makes no distinction Meta does not have between default and update', () => {
    meta().consent?.('default', { ad_storage: 'denied' });
    meta().consent?.('update', { ad_storage: 'denied' });

    expect(calls).toEqual([
      ['consent', 'revoke'],
      ['consent', 'revoke'],
    ]);
  });

  it('offers no identify, because Meta accepts identity only in the base code', () => {
    // "Be sure to place advanced matching parameters in the pixel base code
    // or the values will not be treated as manual advanced matching values."
    // The base code is the host's, so a call after it would look mapped and
    // arrive nowhere. Server-side, where there is no snippet, the same
    // identity travels in the context and is hashed by the adapter.
    expect(meta().identify).toBeUndefined();
  });

  it('never installs anything on the page', () => {
    // The pixel belongs to the host. This library does not inject
    // third-party scripts and does not call `fbq('init')`.
    expect(meta().install).toBeUndefined();
  });

  it('fails loudly when the pixel is missing, the way a hand-written call would', () => {
    vi.stubGlobal('window', {});

    expect(() => meta().track('Purchase', {}, {})).toThrow(/fbq/);
  });

  it('fails the same way when there is no browser at all', () => {
    vi.stubGlobal('window', undefined);

    expect(() => meta().track('Purchase', {}, {})).toThrow(/fbq/);
  });
});

// The invariants every provider owes, run against this one. What Meta sends
// and how it spells it is above; this is the part that must hold for a
// provider written by somebody else, for a vendor nobody here has heard of.
describe('meta browser conformance', () => {
  conformsAsBrowserProvider({
    create: () => meta(),
    captured: () => calls,
    reset: () => {
      calls = [];
    },
  });
});
