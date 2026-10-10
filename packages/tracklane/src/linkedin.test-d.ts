import { expectTypeOf, it } from 'vitest';
import { type BrowserProvider, linkedin as browser } from './browser.js';
import { type ServerProvider, linkedin as server } from './server.js';

it('requires a conversion map on both factories and preserves provider compatibility', () => {
  expectTypeOf(
    browser({ events: { purchase: '12345', internal: null } }),
  ).toEqualTypeOf<BrowserProvider>();
  expectTypeOf(
    server({ accessToken: 'token' }, { events: { purchase: '67890' } }),
  ).toEqualTypeOf<ServerProvider>();
  // @ts-expect-error LinkedIn has no event names to pass through.
  browser({});
  // @ts-expect-error LinkedIn requires the server conversion map too.
  server({ accessToken: 'token' }, {});
  // @ts-expect-error Maps use string IDs consistently with the provider contract.
  browser({ events: { purchase: 12345 } });
});
