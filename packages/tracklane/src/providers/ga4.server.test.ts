import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { conformsAsServerProvider } from '../conformance.js';
import { isVendorResponseError } from '../index.js';
import type { ResolvedContext } from '../server.js';
import { ga4 } from './ga4.server.js';

const credentials = { measurementId: 'G-ABC', apiSecret: 's3cret' };

const context = (over: Partial<ResolvedContext> = {}): ResolvedContext => ({
  cookies: { _ga: 'GA1.1.1234567890.1700000000', _ga_ABC: 'GS2.1.s1700000123$o1$g0' },
  timestamp: 1_700_000_000_000,
  ...over,
});

let fetchMock: ReturnType<typeof vi.fn>;
const noop = (): void => {};

const sent = (): Record<string, unknown> => {
  const request = fetchMock.mock.calls[0]?.[1] as { body: string } | undefined;
  return JSON.parse(String(request?.body)) as Record<string, unknown>;
};

beforeEach(() => {
  fetchMock = vi.fn(async () => new Response(null, { status: 204 }));
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('ga4 server', () => {
  it('posts to the Measurement Protocol with the credentials in the query', async () => {
    // The protocol offers no body slot for them. That exposure is Google's
    // design, not a choice made here.
    await ga4(credentials).track('purchase', {}, context(), noop);

    const url = new URL(String(fetchMock.mock.calls[0]?.[0]));
    expect(url.origin + url.pathname).toBe('https://www.google-analytics.com/mp/collect');
    expect(url.searchParams.get('measurement_id')).toBe('G-ABC');
    expect(url.searchParams.get('api_secret')).toBe('s3cret');
  });

  it('reads the visitor id out of the vendor cookie', async () => {
    await ga4(credentials).track('purchase', {}, context(), noop);

    expect(sent()).toMatchObject({ client_id: '1234567890.1700000000' });
  });

  it('refuses to send when the visitor id is missing, and says why', async () => {
    // Not a policy decision: the field is required and cannot be invented.
    // The endpoint answers success even to invalid payloads, so sending
    // anyway would look like it worked and land in no report.
    await expect(
      ga4(credentials).track('purchase', {}, context({ cookies: {} }), noop),
    ).rejects.toThrow(/client_id/);

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('reads the session out of the current cookie layout', async () => {
    // Captured from Google's live tag on 2026-07-31, not invented: the third
    // dot-segment packs several fields joined by `$`, and the session is the
    // first of them behind an `s`.
    const ctx = context({
      cookies: {
        _ga: 'GA1.1.509903072.1785511401',
        _ga_HX88SQXE12: 'GS2.1.s1785511401$o1$g0$t1785511401$j60$l0$h0',
      },
    });

    await ga4({ measurementId: 'G-HX88SQXE12', apiSecret: 's3cret' }).track(
      'purchase',
      {},
      ctx,
      noop,
    );

    const events = sent().events as { params: Record<string, unknown> }[];
    expect(events[0]?.params).toMatchObject({
      session_id: '1785511401',
      engagement_time_msec: 1,
    });
  });

  it('reads the session of its own property, not whichever came first', async () => {
    // A page with a marketing property and a product property has two of
    // these cookies. Sending the other one's session is accepted by Google
    // and matches nothing, the vendor's worst failure mode.
    const ctx = context({
      cookies: {
        _ga: 'GA1.1.1234567890.1700000000',
        _ga_OTHER: 'GS2.1.s111111111$o1$g0$t111111111$j60$l0$h0',
        _ga_ABC: 'GS2.1.s222222222$o1$g0$t222222222$j60$l0$h0',
      },
    });

    await ga4(credentials).track('purchase', {}, ctx, noop);

    const events = sent().events as { params: Record<string, unknown> }[];
    expect(events[0]?.params).toMatchObject({ session_id: '222222222' });
  });

  it('reads the session out of the older cookie layout too', async () => {
    const ctx = context({
      cookies: {
        _ga: 'GA1.1.1234567890.1700000000',
        _ga_ABC: 'GS1.1.1700000123.1.1.1700000456.0.0.0',
      },
    });

    await ga4(credentials).track('purchase', {}, ctx, noop);

    const events = sent().events as { params: Record<string, unknown> }[];
    expect(events[0]?.params).toMatchObject({ session_id: '1700000123' });
  });

  it('never sends a session it could not read', async () => {
    // The failure this replaced: the whole packed blob was sent as the
    // session id, which Google accepts and never matches.
    const report = vi.fn();
    const ctx = context({
      cookies: { _ga: 'GA1.1.1234567890.1700000000', _ga_ABC: 'GS9.1.something-new' },
    });

    await ga4(credentials).track('purchase', {}, ctx, report);

    const events = sent().events as { params: Record<string, unknown> }[];
    expect(events[0]?.params.session_id).toBeUndefined();
    expect(report).toHaveBeenCalledOnce();
  });

  it('warns loudly when the session is missing but still sends', async () => {
    // Google accepts the event and then shows it in no report at all,
    // the worst failure mode of the five vendors, and invisible without this.
    const report = vi.fn();
    const ctx = context({ cookies: { _ga: 'GA1.1.1234567890.1700000000' } });

    await ga4(credentials).track('purchase', {}, ctx, report);

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(report).toHaveBeenCalledWith(expect.stringMatching(/report/i));
  });

  it('carries the event name and the business payload', async () => {
    await ga4(credentials).track('purchase', { value: 10, currency: 'BRL' }, context(), noop);

    const events = sent().events as { name: string; params: Record<string, unknown> }[];
    expect(events[0]?.name).toBe('purchase');
    expect(events[0]?.params).toMatchObject({ value: 10, currency: 'BRL' });
  });

  it('converts the instant to the unit Google expects', async () => {
    await ga4(credentials).track('purchase', {}, context(), noop);

    expect(sent()).toMatchObject({ timestamp_micros: 1_700_000_000_000_000 });
  });

  it('sends the dedup id nowhere', async () => {
    await ga4(credentials).track('purchase', {}, context({ dedupId: 'order-1' }), noop);

    expect(JSON.stringify(sent())).not.toContain('order-1');
  });

  it('sends the user id and wraps person properties the way this endpoint wants', async () => {
    // Verified against Google's validation endpoint on 2026-07-31: a bare
    // value here is rejected as invalid, while the collection endpoint
    // answers 204 and silently drops it.
    const ctx = context({ user: { userId: 'u-1' }, traits: { plan: 'pro', seats: 3 } });

    await ga4(credentials).track('purchase', {}, ctx, noop);

    expect(sent()).toMatchObject({
      user_id: 'u-1',
      user_properties: { plan: { value: 'pro' }, seats: { value: 3 } },
    });
  });

  it('forwards only the two consent signals this protocol documents', async () => {
    const ctx = context({ consent: { ad_user_data: 'granted', ad_storage: 'denied' } });

    await ga4(credentials).track('purchase', {}, ctx, noop);

    // ad_storage has no slot in this body; only ad_user_data and
    // ad_personalization do.
    expect(sent().consent).toEqual({ ad_user_data: 'GRANTED' });
  });

  it('omits consent entirely when the host declared nothing', async () => {
    await ga4(credentials).track('purchase', {}, context(), noop);

    expect(sent().consent).toBeUndefined();
  });

  it('throws on a refusal so the dispatcher can report it', async () => {
    fetchMock.mockResolvedValue(new Response('nope', { status: 500 }));

    await expect(ga4(credentials).track('purchase', {}, context(), noop)).rejects.toThrow(/500/);
  });

  it('never puts the payload into the error it throws', async () => {
    fetchMock.mockResolvedValue(new Response('nope', { status: 500 }));
    const ctx = context({ user: { email: 'ana@example.com' } });

    await expect(ga4(credentials).track('purchase', {}, ctx, noop)).rejects.toThrow(
      expect.objectContaining({
        message: expect.not.stringContaining('ana@example.com') as string,
      }),
    );
  });

  it('throws a VendorResponseError carrying the status and the vendor’s own body', async () => {
    // ADR-0013: a refusal carries the vendor's own answer, so the host has
    // somewhere to go from "it failed" — identical shape across the three
    // server providers, so this is a contract test, not a GA4 one.
    const body =
      '{"validationMessages":[{"fieldPath":"events[0].name","description":"Value not allowed","validationCode":"VALUE_INVALID"}]}';
    fetchMock.mockResolvedValue(new Response(body, { status: 500 }));

    const error: unknown = await ga4(credentials)
      .track('purchase', {}, context(), noop)
      .catch((thrown: unknown) => thrown);

    expect(isVendorResponseError(error)).toBe(true);
    expect(error).toMatchObject({ provider: 'ga4', status: 500, body });
  });

  it('keeps the message free of the body and the vendor’s own validation code', async () => {
    // The two surfaces ADR-0013 draws apart: `cause`/`body` may quote the
    // request back, `message` never does.
    fetchMock.mockResolvedValue(
      new Response('{"validationMessages":[{"validationCode":"VALUE_INVALID"}]}', {
        status: 500,
      }),
    );

    const error: unknown = await ga4(credentials)
      .track('purchase', {}, context(), noop)
      .catch((thrown: unknown) => thrown);

    expect((error as Error).message).toBe('ga4: the Measurement Protocol answered 500');
    expect((error as Error).message).not.toContain('VALUE_INVALID');
    expect((error as Error).message).not.toContain('validationMessages');
  });

  it('does not wrap the missing-client_id precondition as a VendorResponseError', async () => {
    // There is no response to carry: ADR-0013 keeps precondition throws
    // bare, and this is one of the three ADR-0012 already covers.
    const error: unknown = await ga4(credentials)
      .track('purchase', {}, context({ cookies: {} }), noop)
      .catch((thrown: unknown) => thrown);

    expect(isVendorResponseError(error)).toBe(false);
  });
});

// See the note in ga4.browser.test.ts: these are the invariants, not GA4's
// behaviour.
describe('ga4 server conformance', () => {
  conformsAsServerProvider({
    create: () => ga4(credentials),
    captured: () => fetchMock.mock.calls,
    reset: () => {
      fetchMock.mockClear();
      fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    },
    fail: () => {
      fetchMock.mockResolvedValueOnce(new Response(null, { status: 500 }));
    },
    context: () => context(),
  });
});
