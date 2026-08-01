# tracklane

> One interface between your application and every tool that receives events.

Every analytics and advertising tool arrives with its own SDK, its own event names and its own
payload format. Add a second one and the tracking call at each conversion point stops being a line
and becomes a block. Add a third and every one of those blocks has to change.

`tracklane` gives your application one interface. Name what happened once, in GA4's vocabulary,
and it reaches every tool you configured, in the browser and through their server-side conversion
APIs.

**Documentation:** https://tracklane.codar.me

## Install

```bash
pnpm add tracklane
```

Node `>=22.14.0`, ESM only.

## Browser

The vendor's own tag goes on your page first, the way the vendor documents it. This library talks
to the tag that is there. It does not inject third-party scripts.

```ts
import { createTracking, ga4 } from 'tracklane/browser';

const { track, identify, consent } = createTracking({
  providers: [ga4('G-XXXXXXX')],
  onError: (error) => report(error),
});

track('purchase', { transaction_id: 'T-1024', value: 49.9, currency: 'BRL' });
identify({ userId: 'user_42', email: 'ana@example.com' }, { plan: 'pro' });
consent('update', { ad_storage: 'granted', analytics_storage: 'granted' });
```

## Server

```ts
import { createTracking, ga4 } from 'tracklane/server';

const { track } = createTracking({
  providers: [ga4({ measurementId: 'G-XXXXXXX', apiSecret })],
});

await track('purchase', order, {
  cookies: request.headers.get('cookie'),
  user: { userId: order.userId, email: order.email },
  dedupId: order.id,
  timestamp: order.paidAt,
});
```

Pass the request's cookies: the vendors' own tags set them in the browser, and their server APIs
need what is inside. This library reads them for you, because that parsing is the part that fails
silently.

## What it does not do

It standardises and organises, and it never changes behaviour. The test applied to every decision
is *if you did not have this library, how would you write this line by hand?* It replicates
exactly that.

So it is not a consent platform: it forwards the consent call you make, when you make it, and
decides nothing. It is not a compliance layer, a validator, or a delivery guarantee. There is no
queue, no retry, and one vendor failing never affects another or your call site. And it does not
install vendor tags.

## Providers

**GA4** ships today, on both surfaces. **Meta, LinkedIn, PostHog and X** are next.

Any tool that receives events about what your users do can be a destination, and writing your own
uses the same public contract the built-in ones use, without a registry entry, an allow-list, or a
release of this library. See [writing a provider](https://tracklane.codar.me/docs/providers/custom).

## License

MIT © Bruno Bertolini
