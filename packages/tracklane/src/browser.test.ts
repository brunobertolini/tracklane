import { describe, expect, it, vi } from 'vitest';
import type { BrowserProvider } from './browser.js';
import { createTracking } from './browser.js';

const provider = (over: Partial<BrowserProvider> = {}): BrowserProvider => ({
  name: 'test',
  default: 'passthrough',
  track: vi.fn(),
  ...over,
});

describe('createTracking (browser)', () => {
  it('sends one event to every provider', () => {
    const a = vi.fn<BrowserProvider['track']>();
    const b = vi.fn<BrowserProvider['track']>();

    const { track } = createTracking({
      providers: [provider({ name: 'a', track: a }), provider({ name: 'b', track: b })],
    });

    track('purchase', { value: 10 });

    expect(a).toHaveBeenCalledOnce();
    expect(b).toHaveBeenCalledOnce();
  });

  it('passes the canonical name, the data and the dedup id through', () => {
    const track_ = vi.fn<BrowserProvider['track']>();
    const { track } = createTracking({ providers: [provider({ track: track_ })] });

    track('purchase', { value: 10 }, { dedupId: 'T-1' });

    expect(track_).toHaveBeenCalledWith('purchase', { value: 10 }, { dedupId: 'T-1' });
  });

  it('never invents a dedup id', () => {
    // Only a value the host already owns can match on both sides; a
    // generated one deduplicates nothing while looking like it does.
    const track_ = vi.fn<BrowserProvider['track']>();
    const { track } = createTracking({ providers: [provider({ track: track_ })] });

    track('purchase');

    expect(track_.mock.calls[0]?.[2]).toEqual({});
  });

  it('keeps one provider failing from affecting the others', () => {
    const good = vi.fn<BrowserProvider['track']>();
    const onError = vi.fn();

    const { track } = createTracking({
      providers: [
        provider({
          name: 'broken',
          track: () => {
            throw new Error('vendor exploded');
          },
        }),
        provider({ name: 'good', track: good }),
      ],
      onError,
    });

    track('purchase');

    expect(good).toHaveBeenCalledOnce();
    expect(onError).toHaveBeenCalledOnce();
    expect(onError.mock.calls[0]?.[0]).toMatchObject({
      provider: 'broken',
      event: 'purchase',
      severity: 'error',
    });
  });

  it('never lets a failure reach the call site', () => {
    const { track } = createTracking({
      providers: [
        provider({
          track: () => {
            throw new Error('vendor exploded');
          },
        }),
      ],
    });

    expect(() => track('purchase')).not.toThrow();
  });

  it('never puts event data into a diagnostic', () => {
    const onError = vi.fn();
    const { track } = createTracking({
      providers: [
        provider({
          track: () => {
            throw new Error('boom');
          },
        }),
      ],
      onError,
    });

    track('purchase', { value: 999, email: 'ana@example.com' });

    const reported = JSON.stringify(onError.mock.calls[0]?.[0]);
    expect(reported).not.toContain('ana@example.com');
    expect(reported).not.toContain('999');
  });

  it('rejects the same vendor registered twice', () => {
    // Nothing a second registration could say that the first cannot, and
    // accepting both would double every event to that vendor.
    expect(() =>
      createTracking({
        providers: [provider({ name: 'ga4' }), provider({ name: 'ga4' })],
      }),
    ).toThrow(/ga4/);
  });

  it('installs each provider once, at creation', () => {
    const install = vi.fn();

    createTracking({ providers: [provider({ install })] });

    expect(install).toHaveBeenCalledOnce();
  });

  it('reports an install that fails instead of losing it', () => {
    const onError = vi.fn();

    createTracking({
      providers: [
        provider({
          install: () => {
            throw new Error('script blocked');
          },
        }),
      ],
      onError,
    });

    expect(onError.mock.calls[0]?.[0]).toMatchObject({ event: 'install' });
  });

  it('forwards identify only to providers that hold a user', () => {
    const identify_ = vi.fn();
    const { identify } = createTracking({
      providers: [provider({ name: 'holds', identify: identify_ }), provider({ name: 'plain' })],
    });

    expect(() => identify({ userId: 'u-1' }, { plan: 'pro' })).not.toThrow();
    expect(identify_).toHaveBeenCalledWith({ userId: 'u-1' }, { plan: 'pro' });
  });

  it('forwards consent only to providers that document a command', () => {
    const consent_ = vi.fn();
    const { consent } = createTracking({
      providers: [provider({ name: 'has', consent: consent_ }), provider({ name: 'none' })],
    });

    expect(() => consent('update', { ad_storage: 'granted' })).not.toThrow();
    expect(consent_).toHaveBeenCalledWith('update', { ad_storage: 'granted' });
  });

  it('dispatches even when consent was never declared', () => {
    // The library never withholds a send on policy grounds. Whether an
    // event should be sent is decided where the host already decides it.
    const track_ = vi.fn<BrowserProvider['track']>();
    const { track } = createTracking({ providers: [provider({ track: track_ })] });

    track('purchase');

    expect(track_).toHaveBeenCalledOnce();
  });
});

describe('event resolution', () => {
  it('prefers the provider map over the canonical name', () => {
    const track_ = vi.fn<BrowserProvider['track']>();
    const { track } = createTracking({
      providers: [provider({ events: { purchase: 'Purchase' }, track: track_ })],
    });

    track('purchase');

    expect(track_.mock.calls[0]?.[0]).toBe('Purchase');
  });

  it('passes the canonical name through when nothing is mapped', () => {
    const track_ = vi.fn<BrowserProvider['track']>();
    const { track } = createTracking({ providers: [provider({ track: track_ })] });

    track('purchase');

    expect(track_.mock.calls[0]?.[0]).toBe('purchase');
  });

  it('sends nothing when the vendor mints event ids in a dashboard', () => {
    // LinkedIn and X have no event names at all, so an unmapped event has
    // no call that could be made — not silence by policy.
    const track_ = vi.fn<BrowserProvider['track']>();
    const { track } = createTracking({
      providers: [provider({ default: 'ignore', track: track_ })],
    });

    track('purchase');

    expect(track_).not.toHaveBeenCalled();
  });

  it('treats a null binding as "never send this event here"', () => {
    const track_ = vi.fn<BrowserProvider['track']>();
    const { track } = createTracking({
      providers: [provider({ events: { internal_event: null }, track: track_ })],
    });

    track('internal_event');

    expect(track_).not.toHaveBeenCalled();
  });

  it('is not fooled by inherited object properties', () => {
    const track_ = vi.fn<BrowserProvider['track']>();
    const { track } = createTracking({ providers: [provider({ events: {}, track: track_ })] });

    track('constructor');

    expect(track_.mock.calls[0]?.[0]).toBe('constructor');
  });
});
