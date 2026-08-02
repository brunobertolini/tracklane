# ADR-0003 — The public surface

- **Status:** proposed
- **Date:** 2026-07-31
- **Decision context:** three models (Fable, GPT-5.5 via Codex, Grok) each derived a surface
  independently from the owner's sketch, the rule in ADR-0002 and `docs/research/providers.md`.
  The result was then falsified against a complete working implementation of the same problem,
  which exercises these vendor endpoints for real. Corrections that survived that pass are marked
  **[falsified]**.

## The starting point

The owner's sketch. This surface departs from it only where a named vendor requirement forces it:

```ts
const { track } = createTracking({
  providers: [ga4(GA_ID, { /* eventMapping */ }), meta(META_ID, { /* eventMapping */ })],
});

track('purchase', { /* data */ });
```

## Two libraries, one vocabulary

The browser half and the server half are **two libraries that never talk to each other**. They
share no runtime, no state, no instance and no types-for-convenience. They can be built, shipped
and versioned at different times.

What they do share is the **vocabulary**: GA4's event names and the shape of the business payload.
That is what makes `purchase` mean the same thing on both sides, and it is the only sharing with a
reason to exist.

They ship as one package with two import paths rather than two packages: a single install, and a
vocabulary that cannot drift between halves. The separation is in the design, not in the delivery.

An earlier draft of this record designed **one** third argument for both, carrying cookies, event
time, person data and consent. Half of it was dead weight on either side. Splitting it is what
lets the browser call go back to being almost exactly the sketch.

## The browser library

```ts
import { createTracking, ga4, meta } from 'tracklane/browser';

const { track, identify, consent } = createTracking({
  providers: [ga4('G-XXXXXXX'), meta('1234567890')],
});

track('purchase', { transaction_id: 'T-1', value: 99.9, currency: 'BRL' }, { dedupId: 'T-1' });
identify({ userId: 'user_42', email: 'ana@example.com' }, { plan: 'pro' });
consent('update', { ad_storage: 'granted', analytics_storage: 'granted' });
```

```ts
interface TrackOptions {
  /** The only thing the browser needs beyond the event itself. */
  dedupId?: string;
}
```

Everything else a vendor needs here, it already has: the tags read their own cookies and hold
their own session. `identify` forwards to the vendors that keep a user (`gtag('set')`,
`posthog.identify`) and to nobody else. `consent` is a **command**, fired when the host decides —
Google separates the initial declaration from a later update, and the moment belongs to the
caller.

**The vendor tags are not this library's to install.** They belong on the page, put there the way
each vendor documents — a snippet, a tag manager. Two reasons, and neither is effort. Injecting a
third-party script is a decision about a host's content-security policy and its page weight, and
it is not ours to make on their behalf. And a vendor's configuration command *emits*: issuing one
for a property the page already configured produces a duplicate page view on every load, which is
precisely the cost someone migrating onto this library would pay silently.

The consequence is that the **initial** consent declaration is not ours either. Google requires it
before the property is configured, and the snippet doing that configuring is the host's. Ours is
every declaration after it.

A call made when the tag is absent **throws**, and the dispatcher reports it. Writing
`gtag(…)` by hand on a page without the snippet throws too; a silent no-op would be this library
inventing a failure mode the hand-written version does not have — and the worst kind, the one
where a host believes it is measuring.

## The server library

```ts
import { createTracking, ga4, meta } from 'tracklane/server';

const { track } = createTracking({
  providers: [
    ga4({ measurementId: 'G-XXXXXXX', apiSecret }),
    meta({ pixelId: '1234567890', accessToken, actionSource: 'website' }),
  ],
});

await track(
  'purchase',
  { transaction_id: order.id, value: 99.9, currency: 'BRL' },
  {
    user: { userId: order.userId, email: order.email },
    cookies: request.headers.get('cookie'),
    dedupId: order.id,
    timestamp: order.paidAt,
    ip,
    userAgent,
  },
);
```

```ts
interface EventContext {
  user?: UserData;
  /** The request's raw Cookie header, or an already-parsed map. */
  cookies?: string | Record<string, string>;
  dedupId?: string;
  timestamp?: number | Date;   // defaults to now
  source?: ActionSource;       // overrides the factory default
  url?: string;
  ip?: string;
  userAgent?: string;
  traits?: Record<string, unknown>;
  /** Travels inside the event, for the vendors that document such a field. */
  consent?: ConsentState;
}
```

Here there is no `identify` and nothing is held between calls: a server instance is shared by
every request, so a retained identity would attach one visitor to another visitor's conversion.

**Consent on the server is a field, not a command. [falsified]** In the browser, consent is a
*command* fired at a moment. On the server there is no command and no tag to degrade — there is a
*field inside the payload*. Same vocabulary, different mechanism.

**Exactly one vendor consumes it, and that is not an umbrella.** GA4's Measurement Protocol is the
only server API of the five that documents a consent field, and it takes two of the signals rather
than all of them. Passing the same vocabulary the browser uses and having one adapter read the two
it understands is the library's normal behaviour — the same way `identify` reaches only the
vendors that hold a user.

**What this is *not* is a home for every vendor's privacy lever.** Meta's data processing flag and
X's restricted data use are not consent declarations; they are processing markings that each
vendor defines in its own terms. Routing them through a shared consent field would be inventing an
umbrella concept and translating it per vendor, which ADR-0002 forbids. They live on their own
vendor's factory — see below.

## What the third argument is for

**Cookies arrive raw and the adapters read them. [falsified]** GA4's server path needs both a
client identifier and a session identifier, and both live in cookies the browser already set. The
session one is the dangerous half: without it Google **accepts the event, answers success, and the
conversion appears in no report at all**. The parsing is genuinely tricky — the identifier
contains the separator character, and the session cookie changed format in 2025. Asking the host
for pre-parsed values would hand it the one piece of work that fails silently. By hand you hold
the Cookie header and open it yourself, so the library does exactly that.

The field also accepts an already-parsed map, which is the answer for a host whose identifiers do
not come from an incoming Cookie header — a mobile backend, or a value it stored itself. It writes
`{ _ga: storedValue }` under the name the vendor uses, and the adapter reads it the same way. No
second set of fields is needed for that case.

**`source` is a real field. [falsified]** Meta requires it on every server event and rejects the
request without it. Factory default with a per-call override, because by hand it is a constant at
the call site — a website checkout and a cron renewal are different values, and an application
with both would otherwise need two trackers.

**`traits` carries what is known *about* a person. [falsified]** Two server APIs consume it:
GA4's Measurement Protocol accepts `user_properties` in the body, and PostHog's capture endpoint
takes `$set` inside the event properties. Both keep it separate from the identifiers used to match
someone, which is why it is a slot of its own rather than part of `UserData`. Without it, a host
that writes that line by hand cannot write it through the library.

**`timestamp`** exists because a webhook arrives after the fact and LinkedIn rejects conversions
older than 90 days. Absent, it is now — what the hand-written line passes.

**The library never produces `dedupId`.** The browser and the server never share a process in a
server-rendered app, so only a value the host already owns — an order id — can match on both
sides. A generated one would deduplicate nothing while making an unprotected send look protected.

**The field is `dedupId`, not `eventId`.** X uses `event_id` to mean *which* dashboard event is
being sent, which is a different thing entirely; Meta and LinkedIn use their own spellings for
deduplication. With three vendors using three names there is no vendor name to respect, so the
name describes the job. This matters more than usual because getting it wrong is silent: nothing
breaks, the conversion is just counted twice.

## `UserData` — one flat object, one identifier

```ts
interface UserData {
  /** One id for the person. Every vendor receives it under its own name. */
  userId?: string;
  email?: string;
  phone?: string;
  firstName?: string;
  lastName?: string;
  /** From the URL, not from a cookie — which is why it is here and not in `cookies`. */
  twclid?: string;
}
```

**One identifier, not one per vendor.** Each vendor names it differently and translating names is
the library's job. This carries an assumption — that the application has a single notion of "this
person" — which is stated here so it reads as a decision rather than an accident. Anyone who
genuinely holds different ids per vendor calls that vendor's SDK directly for that case; the
library blocks nothing.

Everything else that identifies a person comes from `cookies`, read by whichever adapter knows the
format. Values are always raw: hashing and normalisation are field formats defined by each vendor
and applied inside the adapter that owns the field.

**Correction to an earlier claim, and then a correction to the correction. [restored]** A previous
draft said X accepts raw identifiers in the browser and hashes them itself. This record then called
that falsified, on the grounds that X's pixel documents no identity surface at all. Writing the
adapter found the opposite: the pixel does document `email_address` and `phone_number`, and it does
hash them itself, which is what the research inferred in the first place. The falsification was the
error.

The adapter still sends no identity from the browser, for a different reason that is worth keeping
separate from the vendor fact: those are parameters of a single event rather than a standing
identity, so honouring `identify` would mean holding the person in the provider and attaching them
to every later event. This library keeps no such state, and one that did would carry a visitor
across a logout. Identity reaches X on the server half, where it travels with the call.

## The provider contracts

```ts
interface BrowserProvider {
  name: string;
  track(name: string, data: EventData, options: TrackOptions): void;
  identify?(user: UserData, traits?: Record<string, unknown>): void;
  consent?(command: 'default' | 'update', state: ConsentState): void;
}

interface ServerProvider {
  name: string;
  track(name: string, data: EventData, context: EventContext): Promise<void>;
}
```

Two contracts, because they are two libraries. The factory closes over credentials and the event
map. This is the whole contract, and a provider written outside this repository uses exactly it —
the five official ones get no shortcut.

## Event resolution

The provider's own map, then its default. GA4 and PostHog pass the canonical name through
unchanged, which is why they ship no built-in map. Meta ships one for its standard events and
sends anything else as a custom event, because by hand that event would have been sent. LinkedIn
and X send nothing when an event is unmapped — not silence by policy, but because no call exists
to make. A `null` entry means "never send this event here", which is how a host keeps an internal
product event out of the ad platforms.

**A development-time warning for that silence is owed, and lands with the first provider that
uses `ignore`** — LinkedIn. Building the diagnostic before anything can trigger it would be
guessing at what it should say; shipping LinkedIn without it would be the silent loss this
library keeps finding elsewhere.

`events` is **required by the type** on `linkedin` and `x`: neither vendor has event names, only
conversion rules minted per account in a dashboard.

That requirement lives on each of those factories' own config, not in `BrowserProvider` or
`ServerProvider`, where `events` is and stays optional — GA4 and PostHog ship none. The distinction
matters because this paragraph reads like a guarantee of the core and is not one: a provider
written elsewhere may declare `default: 'ignore'` and accept no map at all, and nothing in the
contract stops it. What the core owes that case is the development-time warning above, which is why
the two are decided together.

## Vendor levers live on the vendor's factory, and only there

Meta's data processing flag — the marking some US state laws require — and X's restricted data use
are configuration on their own factories. Both are pure relay: the vendor documents it, the host
decides, the library forwards. Any future lever a vendor documents belongs to that vendor's factory
and nowhere else. There is no umbrella concept, because inventing one and translating it per vendor
is precisely the opinion ADR-0002 forbids.

**Factory only — no per-call override.** An earlier draft gave Meta's flag a per-call override, and
that quietly contradicted the rule below that a call cannot address one vendor differently from the
others. One exception for one field is how that rule stops being a rule. A host that needs the
marking to vary per visitor — applying it only in certain US states, say — calls Meta's SDK
directly for that case, which is what it would do without the library.

`source` is not an exception to this: it is a canonical field describing where the conversion
happened, which is meaningful independently of any vendor and which Meta happens to be the only one
consuming today.

## No per-call customisation in v1

There is no way to send different data to different vendors from one call. The case it serves —
one vendor needing an extra field — is almost always a fixed rule of an integration rather than
something that varies per conversion, which makes it configuration. And the library blocks
nothing: a host with a genuinely one-off need calls that vendor's SDK directly, alongside the
library call, exactly as it would without the library.

If it turns out to be needed, the additive form is a per-vendor section in the third argument.
Per-vendor methods (`track.ga4()`) are rejected outright: they reintroduce one call per vendor,
which is the problem this library exists to remove.

## Known limitation

**PostHog has no public deduplication key.** A host sending the same event from both halves will
double-count there. There is nothing to implement — the identifier PostHog's own SDK generates is
not in its public reference, and building on undocumented surface breaks silently in someone
else's application when it changes. The PostHog page in the documentation states the consequence
in full. The library's surface is already ready for the day it becomes documented: `dedupId`
travels with every event, so it would be one line in that adapter and no public change.

## Build order

One vendor at a time, **both halves before moving on**: GA4 → Meta → LinkedIn → PostHog → X.

The dominant risk here is not shipping late, it is discovering late that the provider contract
does not fit. That contract has two halves, and proving one of them across five vendors says
nothing about the other. GA4 complete on both sides is already the working MVP.

## Least certain

`UserData`. It is the only vocabulary this library invents — event names are borrowed from GA4
precisely to avoid inventing one, but no vendor's user schema covers the union. Every field in it
has a verified consumer today; the rule going forward is that a field which turns out to serve no
vendor gets deleted rather than kept for symmetry.
