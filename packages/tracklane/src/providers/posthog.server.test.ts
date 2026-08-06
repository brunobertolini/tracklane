import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { conformsAsServerProvider } from '../conformance.js';
import { isVendorResponseError } from '../index.js';
import type { ResolvedContext } from '../server.js';
import { posthog } from './posthog.server.js';

const credentials = { apiKey: 'phc_ABC' };

// posthog-js writes this cookie as `encodeURIComponent(JSON.stringify(value))`,
// confirmed from its own persistence code rather than guessed.
const anonCookie = encodeURIComponent(JSON.stringify({ distinct_id: 'anon-123' }));

const context = (over: Partial<ResolvedContext> = {}): ResolvedContext => ({
  cookies: { [`ph_${credentials.apiKey}_posthog`]: anonCookie },
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

describe('posthog server', () => {
  it('posts to the Capture API on the default US Cloud host', async () => {
    await posthog(credentials).track('purchase', {}, context(), noop);

    const url = new URL(String(fetchMock.mock.calls[0]?.[0]));
    expect(url.origin + url.pathname).toBe('https://us.i.posthog.com/i/v0/e/');
  });

  it('posts to a configured host, for the EU Cloud or a self-hosted instance', async () => {
    await posthog({ ...credentials, host: 'https://eu.i.posthog.com' }).track(
      'purchase',
      {},
      context(),
      noop,
    );

    const url = new URL(String(fetchMock.mock.calls[0]?.[0]));
    expect(url.origin).toBe('https://eu.i.posthog.com');
  });

  it('carries the api key in the body', async () => {
    await posthog(credentials).track('purchase', {}, context(), noop);

    expect(sent()).toMatchObject({ api_key: 'phc_ABC' });
  });

  it('resolves distinct_id from the anonymous cookie when no user is known', async () => {
    await posthog(credentials).track('purchase', {}, context(), noop);

    expect(sent()).toMatchObject({ distinct_id: 'anon-123' });
  });

  it('prefers a known application user id over the anonymous cookie', async () => {
    // The value has to match what the browser SDK is using for this visitor
    // once they are identified, which is the app's own id, not the anonymous
    // one PostHog minted before that happened.
    const ctx = context({ user: { userId: 'user-42' } });

    await posthog(credentials).track('purchase', {}, ctx, noop);

    expect(sent()).toMatchObject({ distinct_id: 'user-42' });
  });

  it('refuses to send when neither a user id nor the cookie is present', async () => {
    // Not a policy decision: the field is required and cannot be invented.
    await expect(
      posthog(credentials).track('purchase', {}, context({ cookies: {} }), noop),
    ).rejects.toThrow(/distinct_id/);

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('carries the event name and the business payload', async () => {
    await posthog(credentials).track('purchase', { value: 10, currency: 'BRL' }, context(), noop);

    expect(sent()).toMatchObject({
      event: 'purchase',
      properties: { value: 10, currency: 'BRL' },
    });
  });

  it('converts the instant to ISO 8601', async () => {
    await posthog(credentials).track('purchase', {}, context(), noop);

    expect(sent()).toMatchObject({ timestamp: '2023-11-14T22:13:20.000Z' });
  });

  it('sends the dedup id as uuid, the field PostHog deduplicates on', async () => {
    const dedupId = '018daf23-89b3-7cf8-a4f1-94064c96df90';

    await posthog(credentials).track('purchase', {}, context({ dedupId }), noop);

    expect(sent()).toMatchObject({ uuid: dedupId });
  });

  it('omits uuid entirely when the host gave no dedup id', async () => {
    await posthog(credentials).track('purchase', {}, context(), noop);

    expect(sent().uuid).toBeUndefined();
  });

  it('still sends when the dedup id is not a UUID, and says why it was dropped', async () => {
    // PostHog rejects a uuid of another shape rather than ignoring it, so
    // forwarding an order id would trade a visible duplicate for no event.
    const report = vi.fn();

    await posthog(credentials).track('purchase', {}, context({ dedupId: 'order-1' }), report);

    expect(JSON.stringify(sent())).not.toContain('order-1');
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(report).toHaveBeenCalledWith(expect.stringContaining('not a UUID') as string);
  });

  it('takes a v4 uuid as readily as a v7 one', async () => {
    const dedupId = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';

    await posthog(credentials).track('purchase', {}, context({ dedupId }), noop);

    expect(sent()).toMatchObject({ uuid: dedupId });
  });

  it('wraps person properties in $set inside properties', async () => {
    const ctx = context({ traits: { plan: 'pro', seats: 3 } });

    await posthog(credentials).track('purchase', {}, ctx, noop);

    expect(sent()).toMatchObject({ properties: { $set: { plan: 'pro', seats: 3 } } });
  });

  it('omits $set entirely when the host declared no traits', async () => {
    await posthog(credentials).track('purchase', {}, context(), noop);

    const properties = sent().properties as Record<string, unknown>;
    expect(properties.$set).toBeUndefined();
  });

  it('throws on a refusal so the dispatcher can report it', async () => {
    fetchMock.mockResolvedValue(new Response('nope', { status: 500 }));

    await expect(posthog(credentials).track('purchase', {}, context(), noop)).rejects.toThrow(
      /500/,
    );
  });

  it('never puts the payload into the error it throws', async () => {
    fetchMock.mockResolvedValue(new Response('nope', { status: 500 }));
    const ctx = context({ traits: { secretPlan: 'do-not-leak' } });

    await expect(posthog(credentials).track('purchase', {}, ctx, noop)).rejects.toThrow(
      expect.objectContaining({
        message: expect.not.stringContaining('do-not-leak') as string,
      }),
    );
  });

  it('throws a VendorResponseError carrying the status and the vendor’s own body', async () => {
    // ADR-0013: a refusal carries the vendor's own answer, so the host has
    // somewhere to go from "it failed" — identical shape across the three
    // server providers, so this is a contract test, not a PostHog one.
    const body =
      '{"type":"validation_error","code":"invalid_payload","detail":"missing distinct_id"}';
    fetchMock.mockResolvedValue(new Response(body, { status: 500 }));

    const error: unknown = await posthog(credentials)
      .track('purchase', {}, context(), noop)
      .catch((thrown: unknown) => thrown);

    expect(isVendorResponseError(error)).toBe(true);
    expect(error).toMatchObject({ provider: 'posthog', status: 500, body });
  });

  it('keeps the message free of the body and the vendor’s own error code', async () => {
    // The two surfaces ADR-0013 draws apart: `cause`/`body` may quote the
    // request back, `message` never does.
    fetchMock.mockResolvedValue(
      new Response('{"type":"validation_error","code":"invalid_payload"}', { status: 500 }),
    );

    const error: unknown = await posthog(credentials)
      .track('purchase', {}, context(), noop)
      .catch((thrown: unknown) => thrown);

    expect((error as Error).message).toBe('posthog: the capture endpoint answered 500');
    expect((error as Error).message).not.toContain('invalid_payload');
    expect((error as Error).message).not.toContain('validation_error');
  });

  it('does not wrap the missing-distinct_id precondition as a VendorResponseError', async () => {
    // There is no response to carry: ADR-0013 keeps precondition throws
    // bare, and this is one of the three ADR-0012 already covers.
    const error: unknown = await posthog(credentials)
      .track('purchase', {}, context({ cookies: {} }), noop)
      .catch((thrown: unknown) => thrown);

    expect(isVendorResponseError(error)).toBe(false);
  });
});

// See the note in posthog.browser.test.ts: these are the invariants, not
// PostHog's behaviour.
describe('posthog server conformance', () => {
  conformsAsServerProvider({
    create: () => posthog(credentials),
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
