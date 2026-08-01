import { describe, expect, it, vi } from 'vitest';
import type { ServerProvider } from './server.js';
import { createTracking } from './server.js';

const provider = (over: Partial<ServerProvider> = {}): ServerProvider => ({
  name: 'test',
  default: 'passthrough',
  track: vi.fn<ServerProvider['track']>(async () => {}),
  ...over,
});

describe('createTracking (server)', () => {
  it('sends one event to every provider', async () => {
    const a = vi.fn<ServerProvider['track']>(async () => {});
    const b = vi.fn<ServerProvider['track']>(async () => {});

    const { track } = createTracking({
      providers: [provider({ name: 'a', track: a }), provider({ name: 'b', track: b })],
    });

    await track('purchase', { value: 10 }, {});

    expect(a).toHaveBeenCalledOnce();
    expect(b).toHaveBeenCalledOnce();
  });

  it('waits for every provider before resolving', async () => {
    // Serverless runtimes kill un-awaited work, so the request has to
    // survive. Awaiting buys that survival, not a delivery guarantee.
    let settled = false;
    const slow = vi.fn(async () => {
      await new Promise((resolve) => setTimeout(resolve, 5));
      settled = true;
    });

    const { track } = createTracking({ providers: [provider({ track: slow })] });
    await track('purchase', {}, {});

    expect(settled).toBe(true);
  });

  it('never rejects, however badly a provider fails', async () => {
    const onError = vi.fn();
    const { track } = createTracking({
      providers: [
        provider({
          name: 'broken',
          track: async () => {
            throw new Error('502 from vendor');
          },
        }),
      ],
      onError,
    });

    await expect(track('purchase', {}, {})).resolves.toBeUndefined();
    expect(onError.mock.calls[0]?.[0]).toMatchObject({
      provider: 'broken',
      severity: 'error',
    });
  });

  it('keeps one provider failing from affecting the others', async () => {
    const good = vi.fn<ServerProvider['track']>(async () => {});

    const { track } = createTracking({
      providers: [
        provider({
          name: 'broken',
          track: async () => {
            throw new Error('down');
          },
        }),
        provider({ name: 'good', track: good }),
      ],
    });

    await track('purchase', {}, {});

    expect(good).toHaveBeenCalledOnce();
  });

  it('hands the context to the adapter untouched', async () => {
    const track_ = vi.fn<ServerProvider['track']>(async () => {});
    const { track } = createTracking({ providers: [provider({ track: track_ })] });

    await track(
      'purchase',
      { value: 10 },
      {
        user: { userId: 'u-1', email: 'ana@example.com' },
        cookies: '_ga=GA1.1.123.456',
        dedupId: 'T-1',
        source: 'website',
      },
    );

    expect(track_.mock.calls[0]?.[0]).toBe('purchase');
    expect(track_.mock.calls[0]?.[1]).toEqual({ value: 10 });
    expect(track_.mock.calls[0]?.[2]).toMatchObject({
      user: { userId: 'u-1', email: 'ana@example.com' },
      cookies: { _ga: 'GA1.1.123.456' },
      dedupId: 'T-1',
      source: 'website',
    });
  });

  it('defaults the event time to now and honours an explicit one', async () => {
    const track_ = vi.fn<ServerProvider['track']>(async () => {});
    const { track } = createTracking({ providers: [provider({ track: track_ })] });

    const before = Date.now();
    await track('purchase', {}, {});
    const defaulted = track_.mock.calls[0]?.[2].timestamp as number;

    await track('purchase', {}, { timestamp: 1_000 });
    const explicit = track_.mock.calls[1]?.[2].timestamp as number;

    expect(defaulted).toBeGreaterThanOrEqual(before);
    expect(explicit).toBe(1_000);
  });

  it('normalises a Date into epoch milliseconds', async () => {
    // Every vendor spells the instant differently; the adapters convert
    // from one number rather than from four possible input shapes.
    const track_ = vi.fn<ServerProvider['track']>(async () => {});
    const { track } = createTracking({ providers: [provider({ track: track_ })] });

    await track('purchase', {}, { timestamp: new Date(1_700_000_000_000) });

    expect(track_.mock.calls[0]?.[2].timestamp).toBe(1_700_000_000_000);
  });

  it('parses a raw Cookie header into a map for the adapters', async () => {
    // The parsing is the part that fails silently, so the library owns it
    // rather than handing it back to every host.
    const track_ = vi.fn<ServerProvider['track']>(async () => {});
    const { track } = createTracking({ providers: [provider({ track: track_ })] });

    await track('purchase', {}, { cookies: '_ga=GA1.1.123.456; _fbp=fb.1.999' });

    expect(track_.mock.calls[0]?.[2].cookies).toEqual({
      _ga: 'GA1.1.123.456',
      _fbp: 'fb.1.999',
    });
  });

  it('accepts an already-parsed cookie map unchanged', async () => {
    // The answer for a host whose identifiers never came from a header.
    const track_ = vi.fn<ServerProvider['track']>(async () => {});
    const { track } = createTracking({ providers: [provider({ track: track_ })] });

    await track('purchase', {}, { cookies: { _ga: 'stored' } });

    expect(track_.mock.calls[0]?.[2].cookies).toEqual({ _ga: 'stored' });
  });

  it('rejects the same vendor registered twice', () => {
    expect(() =>
      createTracking({
        providers: [provider({ name: 'ga4' }), provider({ name: 'ga4' })],
      }),
    ).toThrow(/ga4/);
  });

  it('reports a warning from an adapter without failing the send', async () => {
    const onError = vi.fn();
    const { track } = createTracking({
      providers: [
        provider({
          name: 'ga4',
          track: async (_name, _data, _context, report) => {
            report('accepted, but it will not appear in reports');
          },
        }),
      ],
      onError,
    });

    await track('purchase', {}, {});

    expect(onError.mock.calls[0]?.[0]).toMatchObject({ severity: 'warning' });
  });

  it('holds no identity between calls', async () => {
    // A server instance is shared by every request; retained identity
    // would attach one visitor to another visitor's conversion.
    const track_ = vi.fn<ServerProvider['track']>(async () => {});
    const { track } = createTracking({ providers: [provider({ track: track_ })] });

    await track('purchase', {}, { user: { email: 'first@example.com' } });
    await track('purchase', {}, {});

    expect(track_.mock.calls[1]?.[2].user).toBeUndefined();
  });
});
