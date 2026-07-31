# Research — v1 provider surfaces

- **Date:** 2026-07-31
- **Goal:** establish, from each provider's documentation, what the library must be able to
  express. This matrix is the input to the provider contract — the minimum contract is what
  all five require; what only one requires is the evidence of where the contract needs an
  escape hatch.
- **Deliberate boundary:** this document researches **provider APIs**, never legislation. The
  library's consent vocabulary is derived from the signals providers accept, not from GDPR or
  LGPD concepts. See ADR-0002.
- **Confidence:** `[C]` confirmed in the provider's official documentation; `[I]` inferred
  from a reliable secondary source or a third-party integration, not yet primary-confirmed.
- **Review:** cross-checked by a second model (GPT-5.5). Corrections applied; items it raised
  that could not be primary-confirmed from this environment are marked `[I]` and listed under
  Gaps.

## Matrix

| | **GA4** | **Meta** | **PostHog** | **LinkedIn** | **X** |
|---|---|---|---|---|---|
| Event vocabulary | recommended names + free-form `[C]` | 17 standard names + `trackCustom` `[C]` | any string `[C]` | **none** — numeric dashboard ID `[C]` | **none** — dashboard event ID `[C]` |
| Browser call | `gtag('event', name, params)` `[C]` | `fbq('track', name, params, {eventID})` `[C]` | `posthog.capture(name, props)` `[C]` | `lintrk('track', {conversion_id, …})` `[C]` | `twq('event', 'tw-<pixel>-<event>', {…})` `[I]` |
| Server-side path | Measurement Protocol `[C]` | Conversions API `[C]` | `/i/v0/e` and `/batch` `[C]` | `POST /rest/conversionEvents` `[C]` | `POST /<v>/measurement/conversions/:pixel_id` `[C]` |
| Browser identity | own cookie + `user_id` `[C]` | `_fbp` / `_fbc` cookies `[C]` | `distinct_id` + `identify()` `[C]` | own cookie, matched server-side `[I]` | own cookie + `twclid` `[I]` |
| Server identity | `client_id` required `[C]` | ≥1 `user_data` field `[C]` | `distinct_id` required `[C]` | ≥1 identifier `[C]` | ≥1 identifier `[C]` |
| Hashing required | no `[C]` | SHA-256, per-field normalisation `[C]` | no `[C]` | SHA-256 on email `[C]` | **server only** — pixel accepts raw and hashes itself `[I]` |
| Consent API | `gtag('consent', …)`, 4 signals `[C]` | `fbq('consent', 'grant'\|'revoke')` + server LDU `[C]` | `opt_in_capturing()` / `opt_out_capturing()` `[C]` | **none** — controlled by loading or not loading the script `[I]` | Restricted Data Use flag, both surfaces `[I]` |
| Client↔server dedup | no mechanism `[C]` | `event_id` + `event_name` `[C]` | not confirmed | `event_id` (browser) / `eventId` (API) `[I]` | `conversion_id` `[C]` |

## Per provider

### GA4

gtag.js commands: `config`, `event`, `set`, `get`, `consent`. An event is
`gtag('event', '<name>', {<params>})`; `set` defines parameters attached to every subsequent
event; precedence is event > config > global. `[C]`

Relevant recommended events: `purchase`, `refund`, `add_to_cart`, `remove_from_cart`,
`add_to_wishlist`, `begin_checkout`, `add_payment_info`, `add_shipping_info`, `view_item`,
`select_item`, `search`, `login`, `sign_up`, `share`, `select_content`. Ecommerce events
carry `items[]`. `[C]`

Requirements are conditional rather than flat — `purchase` requires `transaction_id` and
`items`, and `currency` is required **only if `value` is set**. This conditionality is itself
a finding: a naive "required fields" model in the library would misrepresent the provider.
`[C]`

Server-side is the Measurement Protocol: `POST https://www.google-analytics.com/mp/collect`
with `api_secret` in the query. Limits: 25 events per request, 25 parameters per event,
payload under 130 KB, backdating up to 72 h. The body accepts a `consent` object with
`ad_user_data` and `ad_personalization` — **those two only**, not the full browser set. `[C]`

The body also accepts **`user_properties`**, the same person-level properties the browser sets
through `gtag('set', 'user_properties', …)`. This is a server-side consumer for data that is
about a person rather than about an event. `[C]`

> **Verify before implementing:** the reference page read describes the Firebase variant
> (`firebase_app_id`, `app_instance_id`). The web variant uses `measurement_id` and
> `client_id`. `[I]`

**The cookies, captured from Google's live tag on 2026-07-31** — loaded in a real browser against
the test property, rather than read off a doc page:

```
_ga=GA1.1.509903072.1785511401
_ga_HX88SQXE12=GS2.1.s1785511401$o1$g0$t1785511401$j60$l0$h0
```

The visitor id is the last two dot-segments of `_ga` — it contains a dot itself, which is why the
prefix depth cannot be counted on.

The session cookie has **two layouts in the wild**, and the difference is not cosmetic. The older
one (`GS1`) puts the session on its own in the third dot-segment. The current one (`GS2`) packs
several fields into that segment joined by `$`, with the session first and prefixed by `s`.
Reading "the third segment" — which is what the old documentation implies — returns
`s1785511401$o1$g0$…` in full for the current layout. Google **accepts that as a session id and
silently never matches it**, which is indistinguishable from success. No documentation page states
this; only the browser does.

This is the finding that justifies keeping a live target around at all.

**And the second one, from the same session, is worse.** Google's own snippet queues commands with
`dataLayer.push(arguments)` — the arguments object, not an array. That is not a stylistic quirk:
`gtag.js` reads the queue back and only recognises an arguments object as a *command*. An array
pushed in the same place is taken for ordinary dataLayer data and silently discarded.

An implementation that pushed arrays therefore sent **nothing at all** to Google, while looking
entirely healthy from the outside: the tag loaded, `window.gtag` was a function, every call
appeared in the queue, and a full unit-test suite passed. The only visible symptom was that no
cookie was ever set — which is invisible unless someone looks.

**A third one, on the server side.** The Measurement Protocol wants person properties wrapped —
`{ plan: { value: 'pro' } }` — where the browser takes the bare value. Sending the bare value is
rejected as invalid by Google's *validation* endpoint (`/debug/mp/collect`) and **accepted with
204 by the collection endpoint**, which then drops it.

**And a fourth, which invalidates any test that ignores it.** GA4 silently discards traffic from
known bots, and a headless browser announces itself as `HeadlessChrome` in its user agent. Every
request answers 204 exactly as before; the events simply never exist. The same events, from the
same code, appeared in Realtime the moment the browser was launched with an ordinary desktop user
agent. **Any browser-based verification of this vendor must override the user agent, or it
measures nothing while looking like it passed.**

All four share a shape worth naming: **GA4 fails by accepting.** Nothing throws, nothing returns
an error, the page looks correct and the unit tests pass. Only a real report disagrees.

Practical consequence for verifying this vendor:

| Instrument | What it actually proves |
|---|---|
| `/mp/collect` returning 204 | nothing — it answers 204 to invalid payloads too |
| `/debug/mp/collect` | the payload is well-formed; catches the wrapping bug above |
| Network capture in the browser | the request left, with the parameters we intended |
| **Realtime report** | the event exists — the only instrument that catches bot filtering |

Consent: `gtag('consent', 'default'|'update', {…})` over four signals — `ad_storage`,
`analytics_storage`, `ad_user_data`, `ad_personalization` — each `'granted'` or `'denied'`.
`default` must run once before any measurement; `update` responds to user interaction. **There
is no third value**: the not-yet-answered state is expressed by the choice of command and
timing, not by a distinct value. `[C]`

### Meta

`fbq` exposes `init`, `track`, `trackCustom`, `trackSingle`, `consent`, `set`. `[C]`

Seventeen standard events: `AddPaymentInfo`, `AddToCart`, `AddToWishlist`,
`CompleteRegistration`, `Contact`, `CustomizeProduct`, `Donate`, `FindLocation`,
`InitiateCheckout`, `Lead`, `Purchase`, `Schedule`, `Search`, `StartTrial`,
`SubmitApplication`, `Subscribe`, `ViewContent`. Anything else goes through `trackCustom`.
`[C]`

Conversions API: `POST https://graph.facebook.com/<version>/<pixel_id>/events`. An event has
`event_name`, `event_time`, `event_id`, `action_source`, `event_source_url`, `user_data`,
`custom_data`. `[C]`

`user_data` is the heaviest surface of the five. SHA-256 after field-specific normalisation:
`em`, `ph`, `fn`, `ln`, `db` (YYYYMMDD), `ge` (f/m), `ct`, `st`, `zp`, `country` (ISO 3166-1
alpha-2). Not hashed: `client_ip_address`, `client_user_agent`, `fbc`, `fbp`, `external_id`
(hashing recommended), `subscription_id` and others. The official parameter page states at
least one field from the contact group is required `[C]`; an archived Meta-owned schema
suggests any `user_data` key satisfies the minimum, including non-contact identifiers `[I]`.
The difference matters for what the library can call valid — treat as unresolved.

Deduplication: the same `event_id` as the fourth argument of `fbq('track')` and in the CAPI
payload, matched together with `event_name`. `[C]`

Consent: `fbq('consent', 'grant')` and `fbq('consent', 'revoke')`. The server-side equivalent
is `data_processing_options` with `LDU` plus country and state codes. Two distinct mechanisms
for one concept, one per side. `[C]`

### PostHog

`posthog.init(token, options)`; `posthog.capture(name, properties?, options?)` accepts **any**
event name. `identify(distinct_id, userProperties?)` merges the anonymous person into the
identified one. Also `setPersonProperties`, `alias`, `group`, `reset`. `[C]`

Server-side: `POST /i/v0/e` (single) and `/batch`, with `api_key`, `event`, `distinct_id`,
`properties`, and optional `timestamp`. `"$process_person_profile": false` in properties sends
the event anonymously. Person-level properties travel server-side as **`$set` inside
`properties`** — the second server-side consumer of data that is about a person rather than
about an event. `[C]`

Consent: `opt_in_capturing()`, `opt_out_capturing()`, `has_opted_out_capturing()`,
`clear_opt_in_out_capturing()`, plus the `opt_out_capturing_by_default` init option. It is
binary and it is **local SDK state** — not a signal sent alongside the event. `[C]`

Out of scope for us but present in the SDK: autocapture, session replay, feature flags. The
library exposes none of them.

### LinkedIn

**There are no event names.** Every conversion is a rule created in Campaign Manager, which
yields a numeric `conversion_id`. The call is
`lintrk('track', { conversion_id, conversion_value?, currency?, event_id? })`, and with no
resolved `conversion_id` there is no call at all. `[C]`

Conversions API: `POST https://api.linkedin.com/rest/conversionEvents`, with the rule URN
(`urn:lla:llaPartnerConversion:<id>`), `conversionHappenedAt` in epoch milliseconds (at most
90 days old), `conversionValue`, and a `user` object holding `userIds[]` of `idType`/`idValue`
pairs — `SHA256_EMAIL` and `LINKEDIN_FIRST_PARTY_ADS_TRACKING_UUID` among the accepted types.
At least one identifier is required. `[C]`

Deduplication uses the same semantic ID under **different field names per surface**:
`event_id` in the browser tag, `eventId` in the Conversions API. `[I]`

Consent: no command exists. Control is binary and is script loading — the walkerOS reference
integration handles it by deferring injection until consent arrives. `[I]`

### X

Also **no event names**: each event is created in Events Manager and gets an ID, used by both
the pixel and the API. In the browser, `twq('config', '<pixel>')` and
`twq('event', 'tw-<pixel_id>-<event_id>', { value, currency, conversion_id, contents, … })`.
`[I]`

Conversions API: `POST <version>/measurement/conversions/:pixel_id`, with `conversion_time` in
ISO 8601, `event_id` (the dashboard ID), `identifiers`, `value`, `conversion_id` (dedup key)
and `contents`. At least one identifier: `twclid` unhashed, email SHA-256 unsalted, phone in
E.164 then SHA-256, or IP plus user agent — those two always accompanied by a secondary
identifier. Limit of 60,000 events per account per 15 minutes. `[C]`

**Hashing differs by surface:** the CAPI expects pre-hashed fields (`hashed_email`,
`hashed_phone_number`), while the pixel accepts raw `email_address` / `phone_number` and
hashes them itself. `[I]`

Consent: X documents **Restricted Data Use**, a privacy flag rather than a full consent API,
supported on both the pixel and the CAPI. Exact parameter casing is inconsistent across X's
own pages and must be confirmed before implementation. `[I]`

## Findings that shape the design

### 1. There are two families of provider, and the difference is not a detail

GA4, Meta and PostHog accept an event **name**. LinkedIn and X do not: they accept an
**identifier the user created in the platform's dashboard**, specific to their account.

The consequence is direct and has no technical workaround: **"batteries included" is
impossible for LinkedIn and X.** Nobody can ship a mapping from `purchase` to a number that
only exists inside an individual ad account. For these two, explicit configuration is not an
extension — it is a precondition of working at all.

That makes the treatment of unmapped events a product decision rather than an implementation
detail: a `purchase` in an application with LinkedIn configured but unmapped can fail at type
level, warn once in development, or vanish silently.

### 2. The provider that stresses the contract is LinkedIn, not PostHog

ADR-0002 places PostHog third for being the most distant. The research does not support that:
PostHog's `capture()` accepts any string, making it the **easiest** of the five to map — the
canonical vocabulary passes straight through. What makes it different (person profiles,
replay, flags) is outside our scope and puts no pressure on the contract.

LinkedIn does: no event names, no consent API, consent expressed by the absence of a script
load, its own identifier types, and different dedup field names per surface. It exercises four
axes at once that the others exercise separately.

### 3. Consent has no common vocabulary, and one provider has no API at all

The five express consent in mutually incompatible ways: four granular signals at Google, a
boolean at Meta with a different mechanism server-side, local SDK state at PostHog, nothing at
LinkedIn, and a privacy flag rather than consent at X.

Three consequences. First, the library's consent vocabulary cannot be a boolean — the only set
able to feed all five without loss is Google's granular one, with the others receiving a
projection of it. Second, **for at least one provider, honouring consent means not loading the
script**. Third, **no provider has a "not answered yet" value.** Google distinguishes the
`default` command from `update`, which makes the pending state a matter of *when* a command
runs, not *what* it carries.

### 4. Deduplication exists in four of five, under four different names

`event_id` at Meta and in LinkedIn's browser tag, `eventId` in LinkedIn's API, `conversion_id`
at X, nothing at GA4 between gtag and the Measurement Protocol. The identifier is always
generated by the emitter and must match on both sides — meaning it has to cross the
application's browser/server boundary, not the library's.

### 5. Hashing is not uniform, not even within a single provider

Meta, LinkedIn and X require SHA-256 server-side, and Meta requires different normalisation per
field. GA4 and PostHog require nothing. X hashes for you in the browser and expects a hash on
the server — the same provider, two rules, one per surface.

If the library does not hash, the same email is normalised and hashed three times by the
application under three distinct rules — which is where integrations demonstrably go wrong. If
it does hash, it transforms data, which has to be checked against the cutting rule rather than
assumed.

## Gaps

- X: the official pages are behind an access barrier from this environment. Restricted Data
  Use, the pixel's raw-identifier handling and the exact pixel shape all rest on secondary
  sources. Confirm before the X commit.
- GA4 Measurement Protocol: confirm the web variant (`measurement_id` + `client_id`).
- Meta: whether the `user_data` minimum is any key or a contact-group key.
- PostHog: whether an event deduplication key exists.
- LinkedIn: confirm from an official source that no consent command exists, and confirm the
  `eventId` casing in the Conversions API.

## Sources

- [gtag.js reference](https://developers.google.com/tag-platform/gtagjs/reference)
- [Google consent mode](https://developers.google.com/tag-platform/security/guides/consent)
- [GA4 recommended events](https://developers.google.com/analytics/devguides/collection/ga4/reference/events)
- [GA4 Measurement Protocol](https://developers.google.com/analytics/devguides/collection/protocol/ga4/reference)
- [Meta Pixel reference](https://developers.facebook.com/docs/meta-pixel/reference)
- [Meta CAPI — customer information parameters](https://developers.facebook.com/docs/marketing-api/conversions-api/parameters/customer-information-parameters)
- [Meta CAPI — using the API](https://developers.facebook.com/docs/marketing-api/conversions-api/using-the-api)
- [posthog-js](https://posthog.com/docs/libraries/js) · [capture API](https://posthog.com/docs/api/capture) · [identify](https://posthog.com/docs/product-analytics/identify)
- [LinkedIn Conversions API](https://learn.microsoft.com/en-us/linkedin/marketing/integrations/ads-reporting/conversions-api) · [Insight Tag conversion tracking](https://learn.microsoft.com/en-us/linkedin/marketing/integrations/ads-reporting/conversion-tracking) · [deduplication](https://learn.microsoft.com/en-us/linkedin/marketing/conversions/deduplication)
- [walkerOS — LinkedIn destination](https://www.walkeros.io/docs/destinations/web/linkedin)
- [X web conversions](https://docs.x.com/x-ads-api/measurement/web-conversions) · [Restricted Data Use guide](https://business.x.com/en/help/campaign-measurement-and-analytics/conversion-tracking-for-websites/restricted-data-use-guide)
