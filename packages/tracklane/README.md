# tracklane

> One interface between your application and every analytics and advertising tool, in the browser
> and through their conversion APIs.

Every analytics and advertising tool arrives with its own SDK, its own event names and its own
payload format. Add a second one and the tracking call at each conversion point stops being a line
and becomes a block. Add a third and every one of those blocks has to change.

The server-side half is worse. Each vendor ships a separate conversion API with a different name
and a different contract: Google's Measurement Protocol, Meta's Conversions API, LinkedIn's
Conversions API, PostHog's Capture API. Each wants its own identifiers, its own hashing rules, and
its own way of tying a server event back to the browser event so the two are not counted twice.

`tracklane` gives your application one interface for both. Name what happened once, in GA4's
vocabulary, and it reaches every tool you configured, translated into that tool's event names,
payload shape and identifiers.

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

Each vendor's conversion API, behind the call you already wrote. The credentials are that vendor's
own: GA4's Measurement Protocol wants a `measurementId` alongside its `apiSecret`, exactly as its
own endpoint does.

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

Both surfaces, or it does not count as shipped. This table is checked against the source on every
build, so it is never ahead of the library.

<!-- providers:start -->

| Vendor   | Conversion API       | Status |
| -------- | -------------------- | ------ |
| GA4      | Measurement Protocol | shipped |
| Meta     | Conversions API      | next   |
| LinkedIn | Conversions API      | next   |
| PostHog  | Capture API          | next   |
| X        | Conversions API      | next   |

<!-- providers:end -->

Any tool that receives events about what your users do can be a destination, and writing your own
uses the same public contract the built-in ones use, without a registry entry, an allow-list, or a
release of this library. See [writing a provider](https://tracklane.codar.me/docs/providers/custom).

## License

MIT © Bruno Bertolini
