# ADR-0006 — The consent packages

- **Status:** accepted
- **Date:** 2026-08-01
- **Decision context:** ADR-0005 settled that consent lives outside the core, in two packages,
  with the dependency arrow running one way. It sketched their shape in a paragraph. This record
  fixes the public surface, which is the part that cannot be changed later without breaking
  somebody. Two models were given the same brief independently and their designs reconciled; where
  they disagreed is recorded below, because that is where the argument was.

## The decision that forces the others

**The visitor's answer travels in a first-party cookie, and its format is public contract.**

Both designs arrived here independently and neither had a choice. The server must read the answer
per request, and a cookie is the only thing the browser writes that a request carries. Local
storage satisfies the browser half and is invisible to the server, which is exactly what the
documentation site's removed banner did and why that banner could never have served the server.

The format is the categories joined by `|`, each `name:decision`:

```
analytics:granted|marketing:denied
```

Readable in devtools and in a raw `Cookie` header. No encoding, no JSON, no base64. Reading is
lenient: a malformed pair is skipped, an unknown category ignored, an absent one falls back to its
default.

**There is no version token and no extension slot, and that absence is the guard.** The format
carries category to decision and nothing else. A timestamp, a policy version, a proof id, a legal
basis: each would require visibly breaking a documented format, which forces the argument into the
open instead of letting it arrive as a field. Policy change is a new cookie name, which re-asks
every visitor. That is the whole migration story, on purpose.

## `@tracklane/consent`

Four entry points. Three match the shape `tracklane` already has: `.` is types, `./browser` and
`./server` are the two runtimes, sharing the cookie format and nothing else. The fourth,
`./tracklane`, is the bridge described further down, and it is the only one that knows the
tracking library exists.

```ts
type ConsentDecision = 'granted' | 'denied';
```

### `./browser`

```ts
function createConsent<C extends string>(config: {
  /** The host's own category names, and what each is before the visitor answers. */
  categories: Record<C, ConsentDecision>;
  /** Defaults to the first-party cookie. */
  storage?: ConsentStorage;
}): Consent<C>;

interface Consent<C extends string> {
  /** Total and always two-valued. Defaults before an answer, the answer after. */
  readonly state: Readonly<Record<C, ConsentDecision>>;
  /** Whether a stored answer exists. Derived from storage, never held separately. */
  readonly answered: boolean;
  /** The whole record, every configured category. */
  answer(record: Record<C, ConsentDecision>): void;
  subscribe(listener: (state: Readonly<Record<C, ConsentDecision>>) => void): () => void;
}

function cookieStorage(options?: {
  name?: string;    // 'tl_consent'
  domain?: string;
  maxAge?: number;  // one year
}): ConsentStorage;

interface ConsentStorage {
  read(): string | null;
  write(value: string): void;
  /** Erases the record. `answered` returns to false and nothing else is touched. */
  forget(): void;
}
```

`forget` is the one verb added beyond reading and writing, and it earns its place by owning
something the host cannot reproduce safely. Erasing a cookie by hand means repeating its name and
domain exactly; getting either wrong erases nothing and reports no error. The storage already
holds both.

It is not the mechanism for a policy change, which is a new cookie name, and it is not how a
preference screen works, since that calls `answer` with a new record. It is for a visitor who asks
to be forgotten, where the honest outcome is that the site no longer holds their answer and asks
again.

`state` keeps a stable reference between changes, so
`useSyncExternalStore(consent.subscribe, () => consent.state)` works with no adapter and this stays
out of the React business.

### `./server`

```ts
function readConsent<C extends string>(
  cookies: string | Record<string, string> | null | undefined,
  options: { categories: Record<C, ConsentDecision>; name?: string },
): { state: Readonly<Record<C, ConsentDecision>>; answered: boolean };
```

A pure function of the request, with no store, no instance and nothing between calls. The first
parameter mirrors `EventContext.cookies` in `tracklane/server` exactly, so a handler passes the
same value to both without ceremony. It is called inside the handler, where that request's tracking
instance is composed.

## `@tracklane/consent-rules`

```ts
type ConsentPurpose = 'analytics' | 'marketing';

interface ConsentRules {
  /** Whether measurement may begin before the question is answered. */
  mode: 'opt-in' | 'opt-out';
  /** Which purposes the visitor must be offered a choice about. */
  offer: readonly ConsentPurpose[];
  /** What each purpose is before, or absent, an answer. */
  defaults: Readonly<Record<ConsentPurpose, ConsentDecision>>;
  /** The law or regulator guidance this was surveyed from. Rules without one do not ship. */
  source: string;
}

/** `YYYY-MM`. These rules change; an undated assertion would be an opinion presented as fact. */
const surveyedAt: string;

/**
 * ISO 3166-1 alpha-2, optionally with a subdivision (`'US-CA'`). Unknown regions fall back to the
 * strictest surveyed configuration, whose `source` says so.
 */
function rulesFor(region: string): ConsentRules;
```

**`offer` is separate from `defaults` because Brazil proves one field cannot carry both facts.**
There, analytics defaults to granted *and* owes the visitor no choice, since legitimate interest
covers it; marketing defaults to granted *and* owes one. The ADR-0005 sketch had a single
`categories` field and did not survive the first real jurisdiction.

**The purposes are a fixed vocabulary and the host's categories are not.** A jurisdiction survey
cannot speak a vocabulary it has never seen, so the host maps its own category names onto these two
purposes at the point of use. This seam is real and neither the brief nor ADR-0005 had named it.

## Wiring consent to tracklane: `@tracklane/consent/tracklane`

Three things are identical in every project and are therefore not the host's: rebuilding the
tracking instance when the answer changes, forwarding the new state to every provider that
documents a consent command, and keeping a stable `track` for the rest of the application to
import. One thing is genuinely the host's and cannot be absorbed: which provider depends on which
category, because that relation is irregular by nature of the vendors.

This is the one entry point that knows both sides. It is a separate subpath, so a host using
`tracklane` alone, or the consent packages with some other tool, never loads it.

```ts
// tracking.ts
import { consentedTracking } from '@tracklane/consent/tracklane';
import { ga4, meta } from 'tracklane/browser';

export const { track, consent } = consentedTracking({
  region: 'BR',
  providers: [
    ga4('G-KARVI'),
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

That is the whole of it. A bare entry is unconditional; a wrapped one is present only while that
category is granted, and `needs` accepts an array. The word is `providers` in both libraries and
the wrapper's field is `provider`, because a second vocabulary for the same thing is a tax on
everybody who already knows the first.

**This entry point fixes the category names to `analytics` and `marketing`.** It takes a `region`
and derives its categories from `rulesFor(region).defaults`, whose keys are the surveyed purposes,
so there is nowhere for a host's own name to be declared and no `needs: 'ads'` that could resolve.
That is the trade this entry point makes: it is the convenient path and it has an opinion. A host
that wants its own category names assembles the three pieces directly, which stays fully supported:

```ts
const consent = createConsent({ categories: { stats: 'granted', ads: 'granted' } });
let tracking = createTracking({ providers: selectProviders(consent.state, list) });
```

The convenience has opinions, the pieces have none. Trying to serve both from one signature is what
produced the shapes in the rejected list.

### What it returns, exactly

`{ track, identify, consent }`. The first two delegate to the current instance and are stable
across rebuilds. `consent` is the **store** (`state`, `answered`, `answer`, `subscribe`), not
`BrowserTracking.consent`, which this entry point deliberately shadows: forwarding the declaration
is its job, and a host calling it by hand would be declaring something the store does not know
about.

**A provider entering after an `identify` never received it, and nothing replays it.** No queue, no
buffer, no replay (ADR-0002), and holding the last identity in memory to resend is exactly the
retained-identity hazard the server surface was designed to avoid. By hand the outcome is the same:
loading a vendor's tag after a login leaves that vendor not knowing who the visitor is until you
tell it again. A host whose identity matters to a provider that can enter late calls `identify`
again after the answer. This is documented, not solved.

**`install` may run more than once, and a provider that uses it must be idempotent.** Rebuilding
calls `createTracking` again, which installs every provider present, including those already there.
No official provider is affected, because none of them install anything: the tag is always the
host's, by a decision that predates this one. `install` therefore exists only for providers written
elsewhere, and its documented contract changes from "runs once, at creation" to "runs at every
creation, so make it idempotent". That sentence belongs in the provider contract's TSDoc and in the
page about writing a provider.

**`answer` rebuilds.** Recording the answer and recomposing always happen together, and the thing
that owns one owns the other, so there is no `subscribe` and no `rebuild` in the host's code. The
returned `track` delegates to the current instance, so it is stable for the rest of the application
while the instance underneath is genuinely rebuilt: `assertUniqueProviders` runs again, `install`
runs for a provider entering for the first time, and nothing is aliased.

`subscribe` still exists on the consent store, for a preferences screen that has to redraw. It is
no longer on the common path.

### What a live array would have cost

An earlier draft had this return a mutable array that the package kept in sync while the core
walked it. It read better and broke in four ways, all found by adversarial review rather than by
tests:

`assertUniqueProviders` runs once, at creation. Two providers sharing a name that never coexist at
creation but do after an answer would pass the check and double every event to that vendor, which
is the exact defect the check exists to prevent, surfacing weeks later as inflated conversions.

`install` runs once, so a provider entering later is never initialised. `identify` calls made while
a provider was absent are lost, and no queue or replay may exist to recover them (ADR-0002).

Mutating an array while `for...of` walks it, or while the server's `providers.map` has already
captured its length, skips or repeats a provider. The server case is worse because nothing there
subscribes to anything.

Most quietly: it depends on the core never copying the array it was given. A defensive
`[...options.providers]` added in good faith, passing every test, would silently freeze consent
forever, and `readonly BrowserProvider[]` cannot express "this array's identity is observable".

### Presence and signalling are different mechanisms

The irregularity that no shape can file away: **GA4 stays in the list always.** It documents a
consent command with four separate signals precisely because one tag serves several purposes, and
removing it measures less than the vendor itself asks for: signalled a denial, it runs cookieless
and reports modelled data. **Meta has no equivalent command**, so presence is the only lever.
LinkedIn has no mechanism at all.

So `consentedTracking` does two unrelated things on `answer`. It rebuilds, which decides presence
for the wrapped entries, and it then calls `consent('update', …)` **on the new tracking instance**,
which forwards to every provider documenting the command and skips those that do not.

Going through the instance rather than calling each provider directly is not incidental. The
dispatcher isolates a throwing provider and routes it to `onError`; calling `provider.consent()`
directly loses that, and GA4 throws whenever Google's snippet is missing or misordered. Direct
calls would turn a misconfigured page into an exception inside the visitor's click on the banner.

The translation is determined, because the canonical consent vocabulary already is Google's
(ADR-0002): `analytics` becomes `analytics_storage`, `marketing` becomes the three advertising
signals. A host that renamed its categories declares that mapping once.

Neither mechanism gives a provider an opinion. It is called or it is not; it is signalled or it is
not.

**Withholding fields from one provider remains unsolved and is not this.** A vendor with no
anonymous mode cannot be sent a reduced event, only the whole one or nothing. ADR-0005 records that
gap; it surfaced again here on its own, which is the recurrence that would justify reopening it.

### On the server there is nothing to rebuild

`consentedTracking` is browser-only, and saying so is part of the decision rather than an omission.
A server instance is built inside the handler from that request's cookie and discarded with it, so
there is no answer to observe and no instance to keep alive. The server half is the same selection
logic called once:

```ts
import { readConsent, selectProviders } from '@tracklane/consent/server';
import { createTracking, ga4, meta } from 'tracklane/server';

export async function POST(request: Request): Promise<Response> {
  const cookies = request.headers.get('cookie');
  const { state } = readConsent(cookies, { categories: { analytics: 'granted', marketing: 'granted' } });

  const { track } = createTracking({
    providers: selectProviders(state, [
      ga4({ measurementId, apiSecret }),
      { provider: meta({ pixelId, accessToken }), needs: 'marketing' },
    ]),
  });

  // The collapse into Google's vocabulary is the host's here: only the
  // browser bridge ships one, because only there are the category names
  // fixed. See "Your own category names".
  await track('purchase', order, { cookies, consent: { analytics_storage: state.analytics } });
  return new Response(null, { status: 204 });
}
```

`selectProviders` is a pure function of state and list, shared by both halves; the browser entry
calls it on every rebuild. Anything live or subscribed on this side would be the cross-request leak
ADR-0005 exists to prevent, arriving through the door marked convenience.

### The initial declaration stays in the page

Google requires its consent default before the property configuration, and that configuration is
the snippet in the host's HTML. Any function this library exposes runs after it: a module is
deferred, so even the first line of a bundle executes after the page's inline scripts. It always
arrives too late.

Three ways around it were considered and all three cost more than the six lines they save. Letting
the library issue the configuration command means installing a vendor tag and re-introduces the
duplicate page view. A blocking script before the snippet delays rendering to declare a cookie. A
function returning the snippet's text puts gtag knowledge inside the consent package or cookie
knowledge inside `tracklane`, and either breaks the separation that is the main guard here.

So it is documented and copied, once per project, into a file the host is already editing to paste
Google's own snippet. It is writable only because the cookie is legible by eye:

```html
<script>
  var c = (document.cookie.match(/(?:^|; )tl_consent=([^;]*)/) || [])[1] || '';
  var ads = c.includes('marketing:denied') ? 'denied' : 'granted';
  gtag('consent', 'default', {
    analytics_storage: c.includes('analytics:denied') ? 'denied' : 'granted',
    ad_storage: ads, ad_user_data: ads, ad_personalization: ads
  });
  gtag('config', 'G-KARVI');
</script>
```

This applies only to a vendor that requires a declaration before measuring, which today is Google
alone. Everywhere else the later signal suffices and the bridge handles it.

### The price

`consentedTracking` knows both libraries, which ADR-0005 originally forbade in both directions.
That record now forbids only the direction that protects anything, and this is the entry point that
uses the permission. It is a separate subpath with `tracklane` as a peer, so the dependency exists
only for a host that asked for it by importing it.

The exposure is that this becomes the path everybody uses, so it has to be held to the same
standard as the core. In particular it must never grow a way to decide *whether an event is sent*.
It decides which providers exist at the moment of a rebuild, and after that it is not consulted.

## The unanswered state

`state` is total and two-valued per category. `answered` is a separate boolean derived from whether
storage holds a record. "Not answered yet" is `answered === false` while `state` equals the
defaults. It is never a third value, because no vendor has one, and because the defaults *are* what
is in force before an answer, in every jurisdiction.

That is what makes composition identical everywhere. In Brazil the defaults are granted, so
measurement runs; in Germany they are denied, so composing providers from `state` yields nothing
non-essential. Only the banner's behaviour differs, and `mode` is what says which.

## Reconciling the two designs

Where they agreed, independently: the cookie, `answered` as a derived boolean beside a total state,
the server as a pure per-request function, a fixed purpose vocabulary with host-owned categories,
and a dated source on the rules. Agreement between two models is not proof, but each of these also
survives the hand-written test.

Where they disagreed, and what was chosen:

**`answer()` takes the whole record, not a partial one.** A stored partial answer lets a later
change to the defaults silently rewrite what the visitor decided, which is a correctness property
about their own decision rather than a preference. The two-button banner pays for it with a spread,
`answer({ ...consent.state, marketing: 'denied' })`, and the pressure to add a merge will be
constant. This line is where to argue, not in a serializer.

**`offer` belongs to the rules, not to the consent store.** One design put an `offered` flag on
each category in the store's own configuration. That makes the store express what the UI should
show, which is the first step towards it owning the banner. The store holds an answer and has no
opinion about what was asked.

**The cookie format is specified, not left to a serializer.** Only one design wrote it down. An
unspecified format is where a version field and a timestamp appear without anyone deciding to add
them.

### Shapes rejected for the bridge

Six were drawn before the one above, and each failed for a reason worth keeping.

`destinations: { analytics: [...], marketing: [...] }` files every destination under one category,
and GA4 alone disproves that a destination has one purpose.

`destinations: (state) => [...]` and a combinator wrapping a provider both work and both were
rejected as unintuitive by the author, which for a package meant to be the common path is
disqualifying on its own.

A fluent builder, `.whenGranted('marketing').use(meta())`, carries state in the order of its lines,
so reordering two of them silently reattaches a condition to the wrong destination.

A JSON configuration document with a provider registry moves every name and category into untyped
strings, where one misspelling turns advertising permanently on or off with nothing to catch it,
and it needs the registry that ADR-0004 refused.

A `createTracking` exported by the consent package shadows `tracklane`'s own, so two functions share
a name and the import line stops telling the truth about where the tracker comes from. The entry
point that survived has a name of its own.

A `subscribe` in the host's own wiring, so that a rebuild follows an answer automatically, is a
guard against the host forgetting to do something at the only place it is already writing code. The
answer and the rebuild belong to the same owner, so that owner does both.

A live provider array, for the four reasons above. It was the most elegant of all of these and the
only one that would have failed in production rather than in review.

## What stops this becoming the consent manager

The four dead attempts each grew from a small convenience, so the guards are shapes rather than
rules to remember.

The stored state is one flat record with nowhere to put a second fact. `answered` is derived, so
the audit trail has no seed. Neither package has a verb that could answer "may this be sent":
`consent` exposes state, `consent-rules` returns a frozen object containing no function, so a gate
has nowhere to hide. Neither package takes a third-party runtime dependency, and the only
dependency either declares is `@tracklane/consent` on `@tracklane/consent-rules`, which ships from
this repository on the same release. A test in each package asserts that exact shape, so a new
dependency fails the build and has to be argued for here.

Considered and refused by name: `consent.when('marketing', fn)` and any `guard()`, which are the
gate with an indirection; `acceptAll()` and `rejectAll()`, which need the store to know the offered
list and are the first step into banner logic; a `decidedAt` timestamp, because "just for
debugging" is how an audit trail arrives; a React hook export, since `useSyncExternalStore` is one
line of host code; `rulesFor(request)` or any geo-detecting overload.

## Open, and deliberately not solved here

**Region detection is the host's, and turning a time zone into a country is a ~600 entry table.**
ADR-0005 assigned detection to the host and forbade geolocation in these packages. A static site
has only the browser's time zone, so every static consumer copies that table by hand, which is the
shared boilerplate this monorepo exists to absorb. It stays the host's for now, documented as such,
because nobody has asked and a third package is easier to add than to remove. It must not arrive as
a `rulesFor(timeZone)` overload.

**Revocation is not retroactive, and the documentation must say so.** Under opt-out, a vendor's tag
has already fired its page view before the refusal. Recomposition stops future events only, and the
tag stays on the page because tags were never this library's to remove. By hand the outcome is
identical, so nothing in the design changes; without the sentence, the first host audit reads the
surviving tag as a defect in these packages.
