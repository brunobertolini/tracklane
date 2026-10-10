import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { conformsAsServerProvider } from '../conformance.js';
import { isVendorResponseError } from '../index.js';
import { createTracking, linkedin, type ResolvedContext } from '../server.js';

let transport: ReturnType<typeof vi.fn>;
const provider = () => linkedin({ accessToken: 'TEST_TOKEN' }, { events: { purchase: '12345' } });
const context = (over: Partial<ResolvedContext> = {}): ResolvedContext => ({
  cookies: {},
  timestamp: 1_700_000_000_000,
  user: { email: 'buyer@example.com' },
  ...over,
});
const noop = (): void => {};
const sent = (): Record<string, unknown> =>
  JSON.parse((transport.mock.calls[0]?.[1] as RequestInit | undefined)?.body as string) as Record<
    string,
    unknown
  >;
beforeEach(() => {
  transport = vi.fn(async () => new Response(null, { status: 201 }));
  vi.stubGlobal('fetch', transport);
});
afterEach(() => vi.unstubAllGlobals());

it('posts the resolved conversion, milliseconds, decimal string and host dedup ID', async () => {
  const data = {
    value: 0,
    currency: 'BRL',
    items: [{ item_name: 'A' }],
    transaction_id: 'T-1',
    custom: 'secret',
  };
  const before = JSON.stringify(data);
  await createTracking({ providers: [provider()] }).track(
    'purchase',
    data,
    context({ dedupId: 'order-1' }),
  );
  expect(sent()).toEqual({
    conversion: 'urn:lla:llaPartnerConversion:12345',
    conversionHappenedAt: 1_700_000_000_000,
    conversionValue: { currencyCode: 'BRL', amount: '0' },
    eventId: 'order-1',
    user: { userIds: [{ idType: 'SHA256_EMAIL', idValue: await hash('buyer@example.com') }] },
  });
  expect(JSON.stringify(data)).toBe(before);
  expect(transport.mock.calls[0]?.[0]).toBe('https://api.linkedin.com/rest/conversionEvents');
  expect((transport.mock.calls[0]?.[1] as RequestInit | undefined)?.headers).toEqual({
    Authorization: 'Bearer TEST_TOKEN',
    'Content-Type': 'application/json',
    'Linkedin-Version': '202609',
    'X-Restli-Protocol-Version': '2.0.0',
  });
});

async function hash(value: string): Promise<string> {
  return Array.from(
    new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))),
    (byte) => byte.toString(16).padStart(2, '0'),
  ).join('');
}

it('normalizes all email whitespace and decodes the vendor cookie without hashing it', async () => {
  await provider().track(
    '12345',
    {},
    context({ user: { email: ' BUY ER@Example.COM\n' }, cookies: { li_fat_id: 'vendor%2Did' } }),
    noop,
  );
  expect(sent().user).toEqual({
    userIds: [
      { idType: 'SHA256_EMAIL', idValue: await hash('buyer@example.com') },
      { idType: 'LINKEDIN_FIRST_PARTY_ADS_TRACKING_UUID', idValue: 'vendor-id' },
    ],
  });
});

it('carries external IDs alone and keeps the mandatory empty userIds array', async () => {
  await provider().track('12345', {}, context({ user: { userId: 'customer-42' } }), noop);
  expect(sent().user).toEqual({ userIds: [], externalIds: ['customer-42'] });
});

it('supports a full name alone and requires both names for userInfo', async () => {
  await provider().track(
    '12345',
    {},
    context({ user: { firstName: 'Ana', lastName: 'Silva' } }),
    noop,
  );
  expect(sent().user).toEqual({ userIds: [], userInfo: { firstName: 'Ana', lastName: 'Silva' } });
  await expect(
    provider().track('12345', {}, context({ user: { firstName: 'Ana' } }), noop),
  ).rejects.toThrow(/identifier/);
});

it('forwards IPv4 and omits unsupported IPv6 without discarding other identity', async () => {
  await provider().track('12345', {}, context({ ip: '192.0.2.1', user: {} }), noop);
  expect(sent().user).toEqual({
    userIds: [{ idType: 'PLAINTEXT_IP_ADDRESS', idValue: '192.0.2.1' }],
  });
  transport.mockClear();
  await provider().track('12345', {}, context({ ip: '2001:db8::1' }), noop);
  expect(JSON.stringify(sent())).not.toContain('2001:db8');
});

it('does not invent a currency, value, dedup ID or unsupported event properties', async () => {
  const report = vi.fn();
  await provider().track(
    '12345',
    { value: 15 },
    context({ traits: { secret: true }, consent: { analytics_storage: 'denied' } }),
    report,
  );
  expect(sent().conversionValue).toBeUndefined();
  expect(sent().eventId).toBeUndefined();
  expect(JSON.stringify(sent())).not.toContain('secret');
  expect(report).toHaveBeenCalledWith(expect.stringContaining('conversionValue omitted') as string);
});

it('does not report value omission as accepted when the vendor refuses the send', async () => {
  transport.mockResolvedValue(new Response(null, { status: 422 }));
  const report = vi.fn();
  await expect(provider().track('12345', { value: 15 }, context(), report)).rejects.toThrow(/422/);
  expect(report).not.toHaveBeenCalled();
});

it('rejects missing identity before transport and ignores malformed cookie when email remains', async () => {
  await expect(
    provider().track('12345', {}, context({ user: {}, cookies: { li_fat_id: '%broken' } }), noop),
  ).rejects.toThrow(/identifier/);
  expect(transport).not.toHaveBeenCalled();
  await provider().track('12345', {}, context({ cookies: { li_fat_id: '%broken' } }), noop);
  expect(transport).toHaveBeenCalledOnce();
});

it('reports omitted mappings once and keeps null bindings silent', async () => {
  const errors: unknown[] = [];
  await createTracking({
    providers: [linkedin({ accessToken: 'TEST' }, { events: { internal: null } })],
    onError: (error) => errors.push(error),
  }).track('purchase');
  await createTracking({
    providers: [linkedin({ accessToken: 'TEST' }, { events: { internal: null } })],
    onError: (error) => errors.push(error),
  }).track('internal');
  expect(errors).toEqual([expect.objectContaining({ severity: 'warning', event: 'purchase' })]);
  expect(transport).not.toHaveBeenCalled();
});

it('preserves refusal body without leaking it into the message', async () => {
  transport.mockResolvedValue(new Response('private payload', { status: 422 }));
  const error: unknown = await provider()
    .track('12345', {}, context(), noop)
    .catch((error: unknown) => error);
  expect(isVendorResponseError(error)).toBe(true);
  expect(error).toMatchObject({
    status: 422,
    body: 'private payload',
    message: 'linkedin: the Conversions API answered 422',
  });
});

describe('linkedin server conformance', () => {
  conformsAsServerProvider({
    create: provider,
    target: '12345',
    captured: () => transport.mock.calls,
    reset: () => {
      transport.mockClear();
      transport.mockResolvedValue(new Response(null, { status: 201 }));
    },
    fail: () => transport.mockResolvedValueOnce(new Response(null, { status: 500 })),
    context,
  });
});
