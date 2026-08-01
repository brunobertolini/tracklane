# @tracklane/consent

> Holds the visitor's consent answer, and lets it decide which destinations run.

[`tracklane`](https://www.npmjs.com/package/tracklane) never withholds a send. It has no consent
gate and never will. What it does is forward a consent declaration to each vendor that documents a
command for it.

That leaves a real question: if refusing advertising has to stop advertising events, something has
to decide. This package is where that lives, outside the library, which never learns it exists.

```bash
pnpm add @tracklane/consent
```

## The short path

```ts
// tracking.ts
import { consentedTracking } from '@tracklane/consent/tracklane';
import { ga4, meta } from 'tracklane/browser';

export const { track, consent } = consentedTracking({
  region: 'BR',
  providers: [
    ga4('G-XXXXXXX'),
    { provider: meta('1234567890'), needs: 'marketing' },
  ],
});
```

```ts
// banner.ts
import { consent } from './tracking.js';

if (!consent.answered) {
  accept.onclick = () => { consent.answer({ analytics: 'granted', marketing: 'granted' }); hide(); };
  refuse.onclick = () => { consent.answer({ analytics: 'granted', marketing: 'denied' }); hide(); };
}
```

Everywhere else imports `track` and never learns consent exists.

A bare entry is unconditional; a wrapped one is present only while that category is granted. **GA4
is bare on purpose**: it documents its own consent command and honours a denial by running
cookieless, so removing it measures less than the vendor itself asks for. Meta documents no
equivalent, so presence is its only lever.

## The answer lives in a cookie

Local storage would serve the browser and be invisible to your server, which has to read the same
answer per request. So it is a first-party cookie, and its format is public contract:

```
tl_consent=analytics:granted|marketing:denied
```

No encoding, no JSON. It carries category to decision and nothing else, with no version token and
no room to extend, so a timestamp or a legal basis would have to break a documented format in the
open rather than arrive as a field somebody added.

## On the server

```ts
import { readConsent, selectProviders } from '@tracklane/consent/server';

const { state } = readConsent(request.headers.get('cookie'), {
  categories: { analytics: 'granted', marketing: 'granted' },
});

const { track } = createTracking({ providers: selectProviders(state, list) });
```

Build it inside the handler, never at module scope: a server instance is shared by every request,
so a retained one applies one visitor's answer to another visitor's conversion.

## What it does not do

No UI, no geography, no legal basis, no audit trail, and no way to answer "may this be sent".
Revocation is not retroactive, a provider entering late never received your earlier `identify`, and
`install` runs on every rebuild so a provider that uses it must be idempotent.

## Documentation

https://tracklane.codar.me/docs/consent/

MIT © Bruno Bertolini
