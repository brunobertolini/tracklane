import { expectTypeOf, it } from 'vitest';
import type { EventData, IdentifyContext, ResolvedContext, ServerProvider } from './index.js';
import { createTracking } from './server.js';

it('requires a user id on identify and accepts the same context as track', () => {
  const { identify } = createTracking({ providers: [] });

  identify({
    user: { userId: 'u-1' },
    traits: { plan: 'pro', old: null },
    traitsAt: new Date(),
    anonymousId: 'visitor-1',
    signal: new AbortController().signal,
  });
  // @ts-expect-error Identifying nobody is not a call.
  identify({ user: {} });
  // @ts-expect-error A user is required.
  identify({});

  expectTypeOf<IdentifyContext['user']['userId']>().toEqualTypeOf<string>();
});

it('hands adapters traitsAt as epoch milliseconds', () => {
  expectTypeOf<ResolvedContext['traitsAt']>().toEqualTypeOf<number | undefined>();
});

it('keeps providers without identify valid', () => {
  const legacy = {
    name: 'custom',
    default: 'passthrough' as const,
    async track(_name: string, _data: EventData, _context: ResolvedContext): Promise<void> {},
  };
  expectTypeOf(legacy).toExtend<ServerProvider>();
});
