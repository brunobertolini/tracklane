# ADR-0005 — Consent lives outside the core

- **Status:** accepted
- **Date:** 2026-08-01
- **Decision context:** ADR-0002 closed consent as a mapping and listed consent gating among the
  non-goals. It answered the question in the negative and stopped there, which leaves a real
  application with a real problem and no sanctioned way to solve it. This record says where that
  problem is solved instead, and converts "we do not do that" into "here is what you do".

## The problem this addresses

An application with two buttons, opt-out, where refusing cuts advertising and leaves analytics on.
Written by hand it is this:

```js
gtag('event', 'purchase', {...});                        // analytics: always
if (consent.marketing) fbq('track', 'Purchase', {...});  // advertising: conditional
```

That `if` is legitimate. It exists in the hand-written code, so the library has to replicate it or
it fails its own test. What ADR-0002 refuses is not the condition, it is the library **deciding**
the condition on its own. The question this record settles is where the condition is written.

The pull towards answering "inside the library" is strong, and it is exactly the pull that
produced four complete implementations that never shipped. Each one began as a small convenience
and ended holding consent state, a legal basis and an audit trail. This record exists so the fifth
attempt has to argue against something written down.

## Decision

Consent is two packages, and the core is neither of them.

**`@tracklane/consent-rules`** answers what a jurisdiction requires. It returns data, and the word
`provider` does not appear in what it returns:

```ts
rulesFor('BR')  // { mode: 'opt-out', offer: ['marketing'], defaults: { … }, source: '…' }
rulesFor('DE')  // { mode: 'opt-in',  offer: ['analytics', 'marketing'], defaults: { … }, source: '…' }
```

The single `categories` field this record originally sketched did not survive the first real
jurisdiction. ADR-0006 records why it had to split.

**`@tracklane/consent`** holds the visitor's answer. It takes that configuration, stores what the
person chose, and exposes the state and a subscription. No geography, no vendor, no mandatory UI.

**The application** composes the destinations from that state:

```ts
const tracking = createTracking({
  providers: [
    ga4(id),
    ...(consent.state.marketing === 'granted' ? [meta(pixel)] : []),
  ],
});
```

The arrow runs one way: `consent-rules` → `consent` → the application → `tracklane`. **`tracklane`
must never depend on either consent package**, which is the half that matters, because it is what
keeps a consent decision out of the dispatch loop.

An earlier version of this record forbade the reverse as well. That was symmetry rather than
protection: a consent package knowing `tracklane` cannot put a gate inside `tracklane`. ADR-0006
uses the permission, in one clearly separated entry point, to absorb the wiring every host would
otherwise write by hand.

## Why the gate is not in the library

Three costs, and the third is the one that matters most here.

**State the library must not hold.** ADR-0002 already forbids consent state in the library. The
reason is sharper on the server than the browser: a server instance is shared by every request, so
held consent applies one visitor's answer to another visitor's conversion. This is the same
hazard that removed `identify` from the server surface, and it is a privacy defect rather than an
inelegance.

**Ordering becomes a contract.** The moment the library reads consent at send time, "did you call
consent before track" becomes a supported question with a documented answer. Today ordering
belongs to the caller, exactly as it does by hand, and the library has nothing to guarantee.

**The library gains the ability to swallow an event in silence.** Today an event that did not
arrive has two possible causes, the vendor and the network, and both are visible from outside.
A gate adds a third that is invisible: the library decided not to send. Every defect that has cost
this project time was a silent one. Being unable to swallow is an asset, not a missing feature,
and it is the property that a gate trades away first.

## What composition covers

Two axes: what gets cut (a whole vendor, or some of its events), and when it is decided (once at
configuration, or changing at runtime).

|              | per vendor                   | per event                     |
| ------------ | ---------------------------- | ----------------------------- |
| **static**   | do not configure that vendor | `events: { purchase: null }`  |
| **dynamic**  | recompose the provider list  | recompose with a different configuration |

The last cell is the one that looked uncovered and is not, because recomposing is not only
including or excluding a vendor, it is including it configured differently:

```ts
consent.state.marketing === 'granted'
  ? meta(pixel)
  : meta(pixel, { events: { purchase: null, add_to_cart: null } })
```

Recomposition is cheap and safe as long as providers stay what they are today: pure factories that
install nothing and hold nothing. The official providers do not load vendor tags, which ADR-0002
settled for a different reason, and that decision is what makes this one affordable. A provider
that acquires an expensive or non-idempotent `install` would make recomposition costly, which is
one more reason the rule holds.

**On the server, recomposition is per request, never a shared instance rebuilt in place.** A
module-scope tracker mutated from visitor state is the cross-request leak this whole record exists
to avoid, arriving through the door marked "composition" instead of the one marked "gate". The
instance is constructed inside the handler, from that request's consent, and discarded with it.
This is affordable for the same reason as above, and it is the same shape the server surface
already imposes by taking identity per call rather than holding it.

## Why `events` does not accept a function

The proposal was `events: { purchase: ({ email, ...data }) => data }`, to send a vendor the same
event with fewer fields. It is rejected, because the case it serves does not exist here.

Identity does not travel in `EventData`. It travels in `context.user` on the server and through
`identify()` in the browser, and ADR-0003 put it there precisely so it could not leak into the
pass-through event params of vendors that forward the payload as they received it. Withholding an
identifier by consent is therefore already expressible, per call, with nothing added:

```ts
await track('purchase', order, {
  cookies,
  user: consent.state.marketing === 'granted' ? { userId, email } : { userId },
});
```

The cost of adding it anyway is permanent. `EventBinding` is public, implemented by providers
written elsewhere, so its signature changes for everyone. It opens a question with no good answer
about whether the function may also change the event name. And it puts host code inside the
dispatch loop, where a host's exception is reported as a provider failure.

**This does not dispose of per-provider payload projection, which is a real request with no answer
here.** Data minimisation and purpose limitation are about more than identity: a host may
legitimately want GA4 to receive `items` and the page URL while Meta receives only `value` and
`currency`. The dispatcher cannot express that. `browser.ts` hands the same `data` to every
provider, and `server.ts` hands every provider the same resolved context, including `url`, `ip`,
`userAgent` and `traits`. Dropping a field drops it everywhere.

The answer is ADR-0003's and it is unchanged: there is no per-call customisation, and a host with a
genuinely one-off need calls that vendor's SDK directly alongside the library call. That answer
costs the "emit each event once" promise for the events it applies to, and it is worth naming that
cost rather than pretending the case does not exist. If it recurs often enough to reopen, ADR-0003
already records the additive shape it would take, a per-vendor section in the third argument, and
that is where the argument belongs. It is not a consent decision and must not arrive dressed as
one.

## What the rules package answers, and what it never answers

It answers three things: whether measurement may begin before the question is asked, which
categories must be offered, and what each one defaults to. It returns a configuration.

It never answers "may this be sent". It never names a vendor. It never imports `tracklane`. A
jurisdiction map that knows about providers is a compliance layer wearing a different hat, and
ADR-0002 named that as a non-goal in those words.

Two constraints on shipping it, which are about the author rather than the user:

**The name promises what it delivers.** `consent-rules`, not `consent-compliance`. A name is read
by far more people than a disclaimer, and it makes a claim no README can retract.

**The map is dated and sourced.** "Rules as surveyed in August 2026, with a source per
jurisdiction" is a survey, which is honest and defensible. An undated assertion about what the law
requires is an opinion presented as a fact, and these rules do change.

A disclaimer is worth having and settles the smaller risk, which is a user of the package trying
to recover from the author. It does nothing about the larger one: the author's own application is
the first and largest consumer, and a disclaimer written against oneself protects nobody in that
direction.

**This record originally required a qualified review before publication. That requirement was
lifted on 2026-08-01, deliberately, and the trade is worth stating exactly.** No lawyer was going
to read this map, so waiting for one meant never publishing it. The author accepted the residual
risk knowing what it is.

What mitigates it: the name promises a survey and not compliance, `surveyedAt` dates it, every rule
carries the source it was read from, an unknown region gets the strictest configuration surveyed,
and the package README opens with the disclaimer instead of burying it, because the npm page is
where somebody decides to install.

What does not: three jurisdictions is a starting point, everyone else receives a fallback that may
be stricter than their own law requires, and nobody qualified has confirmed that the three are read
correctly. A user who treats this as compliance advice is doing the one thing the first section of
its README tells them not to.

## What actually holds this line, and what does not

The dependency arrow is the design, not the enforcement, and it is worth being exact about the
difference because the previous four attempts were also well intentioned.

A rule that `tracklane` may not depend on either consent package is necessary, mechanisable and
insufficient. **The gate does not need an import.** It arrives like this:

```ts
// in BrowserTrackingOptions and ServerTrackingOptions
shouldSend?: (provider: string, event: string) => boolean;

// in both dispatch loops, before resolveEvent
if (options.shouldSend?.(provider.name, name) === false) continue;
```

Optional, additive, breaking nothing. It passes lint, types, every existing test, knip and package
validation, and it touches no package boundary. Documented as a convenience, tested for, and the
core is once again deciding not to send. No import rule in existence would notice.

A test asserting the shape of the two options interfaces would at least make it visible: adding any
field would fail, and the author would have to come here and argue before proceeding. **That test
was considered and is not being written.** It costs a failing check on every legitimate addition to
those interfaces, and it stops nobody who has already decided, since deleting it is one line in the
same commit. A guard that only inconveniences the honest is not worth its noise.

So the guarantee here is this record and nothing else. That is a weaker position than the previous
sections may read as, and it is stated plainly so that nobody later mistakes a documented intention
for an enforced one. The counterweight is not mechanical: it is that this is the fifth attempt and
the previous four are described in `AGENTS.md` by name.

One correction followed from this review and has since been made. The three build checks ADR-0004
describes did not exist when that record was accepted, while `AGENTS.md` and `CONTRIBUTING.md`
already told a reader the build performed them. They exist now. None of them constrains the core,
so none of them changes the paragraph above.

## What this deliberately does not do

**No consent state in `tracklane`, in any form, including read-only.** A callback the library
invokes at send time is the gate with an indirection, and it carries every cost above.

**No `requires: { meta: 'marketing' }` field on `createTracking`.** It reads as configuration and
is one, but it moves the decision into the library's execution path and gives the library a reason
to know what a consent category is. Composition expresses the same thing where it already belongs.

**No banner component in the core package, and no UI in `tracklane` at all.** The banner is a
consumer of the consent package, not a feature of the tracking one.

**No geolocation anywhere in these packages.** Where the visitor is has three answers depending on
the host, and none of them is the library's to pick: a CDN country header where there is a CDN,
the browser's own time zone where the site is fully static, and a geo-IP request where neither is
available. The rules package takes a country code and does not care how it was obtained.
