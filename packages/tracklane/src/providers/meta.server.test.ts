import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { conformsAsServerProvider } from '../conformance.js';
import type { ResolvedContext } from '../server.js';
import { meta } from './meta.server.js';

const credentials = { pixelId: '123', accessToken: 't0ken' };

// Computed with `node:crypto` rather than with the adapter's own hasher, so
// these assert the digest Meta will look for instead of agreeing with
// whatever the implementation happens to produce.
const HASHED = {
  email: '8e43ca37701228e74983efdbd0cff5c16b3b1e5d4e29a7c05626d4d25a018e11', // ana@example.com
  phone: 'a869177964cc68954ffec997bbad30769f8a5a6fdc60f296ddbc60b9347dc416', // 5511999999999
  leadingZeroPhone: '4ffa5bf096941462f9a0f6a7074f34c66ecb595d9fc869c051a813c712eddf09', // 1199999
  firstName: '24d4b96f58da6d4a8512313bbd02a28ebf0ca95dec6e4c86ef78ce7f01e788ac', // ana
  lastName: 'b4cb6cb33fe4b865868de825023a1e2790dc12ac01ecc8d7c5afe8254071c8ba', // obrien
};

const context = (over: Partial<ResolvedContext> = {}): ResolvedContext => ({
  cookies: { _fbp: 'fb.1.1700000000000.1234567890' },
  timestamp: 1_700_000_000_000,
  ...over,
});

let fetchMock: ReturnType<typeof vi.fn>;
const noop = (): void => {};

const ok = (payload: Record<string, unknown> = { events_received: 1, messages: [] }): Response =>
  new Response(JSON.stringify(payload), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });

/** The single event of the posted batch, as Meta would read it. */
const sent = (): Record<string, unknown> => {
  const request = fetchMock.mock.calls[0]?.[1] as { body: URLSearchParams } | undefined;
  const events = JSON.parse(String(request?.body.get('data'))) as Record<string, unknown>[];

  return events[0] as Record<string, unknown>;
};

const field = (name: string): string | null => {
  const request = fetchMock.mock.calls[0]?.[1] as { body: URLSearchParams } | undefined;
  return request?.body.get(name) ?? null;
};

/** The whole encoded body, for asserting what did *not* leave. */
const wire = (): string => {
  const request = fetchMock.mock.calls[0]?.[1] as { body: URLSearchParams } | undefined;
  return String(request?.body);
};

beforeEach(() => {
  fetchMock = vi.fn(async () => ok());
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('meta server', () => {
  it('posts to the Conversions API at a pinned version', async () => {
    // An unversioned Graph URL resolves to the oldest version still
    // available, which changes what the endpoint accepts the day Meta drops
    // it.
    await meta(credentials).track('Purchase', {}, context(), noop);

    expect(String(fetchMock.mock.calls[0]?.[0])).toMatch(
      /^https:\/\/graph\.facebook\.com\/v\d+\.\d+\/123\/events$/,
    );
  });

  it('keeps the token in the body, which this vendor allows', async () => {
    // Unlike GA4, whose protocol offers no body slot, so its secret has to
    // travel through proxy and APM logs.
    await meta(credentials).track('Purchase', {}, context(), noop);

    expect(String(fetchMock.mock.calls[0]?.[0])).not.toContain('t0ken');
    expect(field('access_token')).toBe('t0ken');
  });

  it('uses the version the host pinned instead', async () => {
    await meta(credentials, { apiVersion: 'v19.0' }).track('Purchase', {}, context(), noop);

    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('/v19.0/');
  });

  it('carries the event name, the instant in seconds and the payload', async () => {
    await meta(credentials).track('Purchase', { value: 10, currency: 'BRL' }, context(), noop);

    expect(sent()).toMatchObject({
      event_name: 'Purchase',
      event_time: 1_700_000_000,
      custom_data: { value: 10, currency: 'BRL' },
    });
  });

  it('translates the order id and the items into the names this surface uses', async () => {
    await meta(credentials).track(
      'Purchase',
      { transaction_id: 'T-1', items: [{ item_id: 'SKU-1', item_name: 'Shoe', quantity: 2 }] },
      context(),
      noop,
    );

    expect(sent().custom_data).toEqual({
      order_id: 'T-1',
      contents: [{ id: 'SKU-1', quantity: 2 }],
    });
  });

  it('omits custom_data rather than sending an empty one', async () => {
    await meta(credentials).track('Purchase', {}, context(), noop);

    expect(sent().custom_data).toBeUndefined();
  });

  it('hashes each identifier under the normalisation Meta defines for it', async () => {
    const ctx = context({
      user: {
        email: '  ANA@Example.com ',
        phone: '+55 (11) 99999-9999',
        firstName: 'Ana',
        lastName: "O'Brien",
      },
    });

    await meta(credentials).track('Purchase', {}, ctx, noop);

    expect(sent().user_data).toMatchObject({
      em: HASHED.email,
      ph: HASHED.phone,
      fn: HASHED.firstName,
      ln: HASHED.lastName,
    });
  });

  it('strips the leading zeros Meta asks for on a phone number', async () => {
    const ctx = context({ user: { phone: '011-99999' } });

    await meta(credentials).track('Purchase', {}, ctx, noop);

    expect(sent().user_data).toMatchObject({ ph: HASHED.leadingZeroPhone });
  });

  it('never lets a raw identifier reach the wire', async () => {
    const ctx = context({ user: { email: 'ana@example.com', phone: '+5511999999999' } });

    await meta(credentials).track('Purchase', {}, ctx, noop);

    expect(wire()).not.toContain('ana%40example.com');
    expect(wire()).not.toContain('5511999999999');
  });

  it('hashes nothing Meta documents as raw', async () => {
    const ctx = context({
      user: { userId: 'u-1' },
      ip: '203.0.113.9',
      userAgent: 'Mozilla/5.0',
      cookies: { _fbp: 'fb.1.1700000000000.1234567890', _fbc: 'fb.1.1700000000000.AbCd' },
    });

    await meta(credentials).track('Purchase', {}, ctx, noop);

    expect(sent().user_data).toEqual({
      external_id: 'u-1',
      client_ip_address: '203.0.113.9',
      client_user_agent: 'Mozilla/5.0',
      fbp: 'fb.1.1700000000000.1234567890',
      fbc: 'fb.1.1700000000000.AbCd',
    });
  });

  it('refuses to send with no identifier at all, and says why', async () => {
    // Not a policy decision: Meta requires at least one `user_data`
    // parameter and none of them can be invented.
    await expect(
      meta(credentials).track('Purchase', {}, context({ cookies: {} }), noop),
    ).rejects.toThrow(/user_data/);

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('never invents an fbc out of a click id it was not given', async () => {
    // Meta documents how to build one from an `fbclid`, and it needs a click
    // timestamp the library does not have.
    const ctx = context({ cookies: {}, url: 'https://shop.example/checkout?fbclid=AbCdEf' });

    await expect(meta(credentials).track('Purchase', {}, ctx, noop)).rejects.toThrow(/user_data/);
  });

  it('requires an action source and defaults to the website', async () => {
    await meta(credentials).track('Purchase', {}, context(), noop);

    expect(sent()).toMatchObject({ action_source: 'website' });
  });

  it('lets the call override the factory default', async () => {
    await meta(credentials, { actionSource: 'system_generated' }).track(
      'Purchase',
      {},
      context({ source: 'physical_store' }),
      noop,
    );

    expect(sent()).toMatchObject({ action_source: 'physical_store' });
  });

  it('carries the dedup id and the page under the names this surface uses', async () => {
    const ctx = context({ dedupId: 'T-1', url: 'https://shop.example/thanks' });

    await meta(credentials).track('Purchase', {}, ctx, noop);

    expect(sent()).toMatchObject({
      event_id: 'T-1',
      event_source_url: 'https://shop.example/thanks',
    });
  });

  it('sends the consent state and the traits nowhere', async () => {
    // Meta has no person-properties slot on this endpoint, and its consent
    // surface is a browser command. Limited Data Use is a processing marking
    // wearing similar words, and it lives on the factory.
    const ctx = context({
      consent: { ad_user_data: 'granted' },
      traits: { plan: 'pro' },
    });

    await meta(credentials).track('Purchase', {}, ctx, noop);

    expect(JSON.stringify(sent())).not.toContain('granted');
    expect(JSON.stringify(sent())).not.toContain('pro');
  });

  it('forwards the Limited Data Use marking the host configured', async () => {
    await meta(credentials, {
      dataProcessingOptions: ['LDU'],
      dataProcessingOptionsCountry: 0,
      dataProcessingOptionsState: 0,
    }).track('Purchase', {}, context(), noop);

    expect(sent()).toMatchObject({
      data_processing_options: ['LDU'],
      data_processing_options_country: 0,
      data_processing_options_state: 0,
    });
  });

  it('marks nothing when the host configured nothing', async () => {
    await meta(credentials).track('Purchase', {}, context(), noop);

    expect(sent().data_processing_options).toBeUndefined();
  });

  it('routes to Test Events when a code is configured', async () => {
    await meta(credentials, { testEventCode: 'TEST123' }).track('Purchase', {}, context(), noop);

    expect(field('test_event_code')).toBe('TEST123');
  });

  it('spells the canonical vocabulary the way Meta does', async () => {
    expect(meta(credentials).events).toMatchObject({ purchase: 'Purchase' });
    expect(meta(credentials, { events: { purchase: null } }).events?.purchase).toBeNull();
  });

  it('throws on a refusal so the dispatcher can report it', async () => {
    fetchMock.mockResolvedValue(new Response('{"error":{}}', { status: 400 }));

    await expect(meta(credentials).track('Purchase', {}, context(), noop)).rejects.toThrow(/400/);
  });

  it('never puts the payload into the error it throws', async () => {
    fetchMock.mockResolvedValue(new Response('{"error":{}}', { status: 400 }));
    const ctx = context({ user: { email: 'ana@example.com' } });

    await expect(meta(credentials).track('Purchase', {}, ctx, noop)).rejects.toThrow(
      expect.objectContaining({
        message: expect.not.stringContaining('ana@example.com') as string,
      }),
    );
  });

  it('reports a warning about a send that already succeeded', async () => {
    // This vendor also fails by accepting: a 200 with messages means Meta
    // took the request and disliked part of it.
    const report = vi.fn();
    fetchMock.mockResolvedValue(
      ok({ events_received: 1, messages: ['invalid parameter'], fbtrace_id: 'Ab1' }),
    );

    await meta(credentials).track('Purchase', {}, context(), report);

    expect(report).toHaveBeenCalledWith(expect.stringContaining('Ab1'));
  });

  it('never quotes Meta’s warning back into the report', async () => {
    // Meta's messages can name the parameter that upset it, and event
    // contents never reach a host's logs through this library.
    const report = vi.fn();
    fetchMock.mockResolvedValue(ok({ messages: ['bad value ana@example.com'], fbtrace_id: 'Ab1' }));

    await meta(credentials).track('Purchase', {}, context(), report);

    expect(report).toHaveBeenCalledWith(expect.not.stringContaining('ana@example.com'));
  });

  it('does not turn a delivered conversion into an error over an unreadable body', async () => {
    // Throwing here would tell a host's retry logic to send a conversion
    // Meta already accepted.
    fetchMock.mockResolvedValue(new Response('<html>proxy</html>', { status: 200 }));

    await expect(meta(credentials).track('Purchase', {}, context(), noop)).resolves.toBeUndefined();
  });
});

// See the note in meta.browser.test.ts: these are the invariants, not Meta's
// behaviour.
describe('meta server conformance', () => {
  conformsAsServerProvider({
    create: () => meta(credentials),
    captured: () => fetchMock.mock.calls,
    reset: () => {
      fetchMock.mockClear();
      fetchMock.mockResolvedValue(ok());
    },
    fail: () => {
      fetchMock.mockResolvedValueOnce(new Response('{"error":{}}', { status: 500 }));
    },
    context: () => context(),
  });
});
