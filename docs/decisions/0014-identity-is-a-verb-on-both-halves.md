# ADR-0014 — Telling each vendor who the person is, on both halves

- **Status:** accepted
- **Date:** 2026-11-09
- **Decision context:** A second production host, a multi-tenant backoffice forwarding each
  workspace's events to that workspace's GA4, Meta and PostHog, asked for identity and profile
  delivery to live here rather than in a wrap each host writes. ADR-0011 named exactly that as its
  reopening condition. The owner's position is that knowing who the user is and telling each tool,
  in that tool's shape, is part of what this library is for. This record agrees, says why ADR-0011's
  objections no longer decide the question, and keeps the part of ADR-0011 that still holds.
  Reviewed adversarially by a second model (`gpt-6-astra`); its findings are applied below.

## The principle the rest follows from

The library is generic and the vendors are not. Every particularity of a vendor falls into one of
four kinds, and each kind has one home:

| Kind | Home | Already in the tree |
| --- | --- | --- |
| **Format**: how the vendor spells the same fact | The adapter, always, with no configuration | Meta hashes the email; GA4 wraps a user property in `{ value }`; PostHog puts traits in `$set` |
| **A documented rule the host's value does not meet** | The adapter sends what the vendor accepts, invents and chooses nothing, and `report`s. It throws only when nothing could be sent (ADR-0012) | A non-UUID `dedupId` is sent without `uuid` and reported; GA4 with no `client_id` throws |
| **A choice only the host can make**, because the vendor needs something the shared vocabulary does not carry | An option on that vendor's factory, named in the vendor's terms | LinkedIn's conversion ids; Meta's data processing flag |
| **Policy about the data**: what is stale, what to erase, whether consent allows it | The host, never the library | ADR-0005 and ADR-0006 |

The fourth row is the line this record is most careful about. The library translates what it was
handed. It never clears, adds, selects or withholds something the host did not say. The moment it
does, a property can change for a reason nobody can see from the call site.

## The decision

**Identity becomes a verb on both halves.** The host says who the person is and what is known about
them in one vocabulary, and each adapter delivers it in its vendor's shape. Vendors that keep no
person receive nothing, silently, as `identify` already behaves in the browser.

### Server

```ts
const { track, identify } = createTracking({ providers: [ga4(...), posthog(...), meta(...)] });

await identify({
  user: { userId: person.reference },
  traits: { plan: 'pro', company_size: null }, // null: no longer known
  anonymousId: storedPosthogId,                  // merge that visitor into the user, once
  cookies,                                       // GA4 still needs its client id
  timestamp: person.updatedAt,
});
```

```ts
interface IdentifyContext extends EventContext {
  user: UserData & { userId: string };
}

interface ServerTracking {
  track(name: string, data?: EventData, context?: EventContext): Promise<void>;
  /** Tells every vendor that keeps a person who this one is. Never rejects. */
  identify(context: IdentifyContext): Promise<void>;
}

interface ServerProvider {
  // …unchanged
  /** Absent where the vendor keeps no person of its own. */
  identify?(context: ResolvedContext, report: (message: string) => void): Promise<void>;
}
```

`identify` takes the same context `track` does, because on the server everything about the person
already travels there. Nothing is retained between calls, so a server instance stays safe to share.

- **PostHog:** one `$identify` event for `user.userId`, with `$set` for traits that have a value and
  `$unset` for traits passed as `null`. `$anon_distinct_id` is added **only** when the host passes
  `anonymousId`. That is the body `posthog-node`'s `identify` sends, plus the merge field
  `posthog-js` sends.
- **GA4:** one Measurement Protocol request with `client_id`, `user_id` and `user_properties` and
  no events, which Google documents ("a request that only contains user properties, without any
  events"). It needs `client_id` exactly as `track` does, and throws without it. With
  `userProvidedData` on, the same request carries `user_data`, and `user_data` alone is enough to
  send it (amended in 0.8.1: a signed-in profile may have no event to ride on). **With neither user
  properties nor `user_data`, GA4 sends nothing.** A request with none of events, properties or
  user data is not a documented case, and `user_id` alone does not make later hits carry it: each
  `track` already sends `user_id` itself.
- **Meta, LinkedIn:** no `identify`. Their identity travels with each event, which `track` already
  does.

**`anonymousId` must be the id the earlier PostHog events were captured under.** If posthog-js
minted it in the browser, the host persists that value while the browser has it, and hands it back,
which is ADR-0007's persist-and-reinject. If the host's own visitor id was used from the first
capture, it is that id. Any other value merges nothing, or merges the wrong visitor. The provider
page shows both shapes.

### Browser

```ts
const { identify, reset, consent } = createTracking({ providers: [ga4(), posthog()] });

identify({ userId: 'user_42' }, { plan: 'pro' }); // unchanged
reset();                                          // new: at sign-out
consent('update', currentState);                  // PostHog's reset also forgets its opt-in
```

`BrowserTracking` gains `reset()`. `BrowserProvider` gains an optional `reset?()`, dispatched the
way `identify` is. A provider written elsewhere implements its own, which is how a host's own vendor
wrapper is reached. `consentedTracking` in `@tracklane/consent` exposes the same `reset`, and re-applies
the stored consent after it, because that entry point already owns forwarding consent.

The two vendors do different things, and the provider pages say so rather than calling both
"sign-out":

- **GA4** sets `user_id` to `null`. User properties already set in the page stay with the tag until
  reload, and the library holds no record of them. Until GA4's browser clear is verified (below),
  `null` traits do not clear them either, so the documented sign-out for a page that sets user
  properties is `reset()` followed by a reload.
- **PostHog** calls `posthog.reset()`, which also clears its persistence and its opt-in state.
  Calling `consent` again after it restores the visitor's answer.

`BrowserProvider.identify` gains the optional `report` callback `track` already has, so a browser
adapter can report what it left out without throwing after a send.

### What changes in the shared vocabulary

Three optional fields on `EventContext`, each with a named consumer:

- **`anonymousId?: string`**: the host's stable id for a visitor nobody has identified yet, with the
  provenance rule above. PostHog uses it as `distinct_id` when there is no `user.userId`, ahead of
  its cookie, and as `$anon_distinct_id` in `identify`. It is supplied by the host and never
  generated, so ADR-0007 is untouched. It is not a second user identifier either: `userId` remains
  the one identifier of the person, and `anonymousId` names the visitor *before* there is a person.
- **`traitsAt?: number | Date`**: when the traits were true, if not when the event happened, in
  the same units as `timestamp`. GA4 documents a `timestamp_micros` on each user property that wins
  over the request's, so GA4 stamps every user property with it. Absent, nothing is stamped per
  property and the request's timestamp applies, as today. PostHog has no slot and ignores it,
  silently, as vendors with no slot always do.
- **`signal?: AbortSignal`**: handed to each provider's `fetch`, which is the line a host writes
  by hand. An aborted send throws and reaches `onError`. Whether it was delivered is ambiguous, as
  ADR-0012 already says of any transport failure.

And one meaning for a value that was already allowed: **a trait set to `null` means "no longer
known"**. Each adapter translates it into its vendor's clear: `$unset` in PostHog, on both halves.
Where a vendor's clear is not verified, the adapter leaves that trait out and reports it, by name.
**GA4 starts there, on both halves.** Clearing a user property is undocumented for the Measurement
Protocol and unverified here for `gtag`. Each half becomes a clear only once its own live check
below shows that it clears, and each is a separate patch with its evidence.
Today PostHog sets the property to `null`, so this is a behaviour change and goes in a changeset.

### Factory option

**`ga4(credentials, { userProvidedData: true })`**, server only. Sends `user_data` built from
`user` (email, phone, first and last name), with Google's documented normalisation and SHA-256, the
same way Meta's adapter already builds its own. It is opt-in for two reasons. It starts a new flow
of personal data to a vendor for every upgrading host that passes those fields for Meta's sake. And
the property must have user-provided data collection turned on in GA4's admin. **There is no consent
gate in it.** A host that must not send it when `ad_user_data` is denied passes
`user: { userId }` for that call, the ADR-0005 shape, which withholds every field that feeds
`user_data` at once.

### Rules an adapter applies without being asked

- **GA4 accepts at most 25 user properties per request.** Over that, the adapter does not pick
  which to keep. It forwards every property supplied and reports that the limit was crossed.
  Which ones Google keeps is Google's behaviour and is not claimed until live collection shows it.
  Choosing a subset is the host's, in the line that builds `traits`.
- **A user property value GA4 documents it will not hold** (a string over its length limit) is left
  out and reported by name, never cleared: a clear would be a value the host did not send.
- **PostHog truncates a `distinct_id` over 200 characters**, which it documents ("shortens any
  `distinct_id` longer than 200 characters"). The adapter sends it as given and reports it, on both
  halves, because two people sharing a prefix will become one and only the host can fix the id.
  Refusing would drop an event the vendor accepts, which is a decision about delivery the library
  does not take.
- **GA4 keeps a caller-supplied `engagement_time_msec`** in the event data instead of overwriting
  it with `1`. The `1` stays the default when a session exists and the host gave none. Today's
  overwrite is a bug in what the provider sends (ADR-0008).

## What ADR-0011 still decides

**No merge inside `track`, and no merge inferred from a cookie.** PostHog's merge is irreversible,
and its refusal surfaces only as an ingestion warning. So a merge happens only when the host calls
`identify` and names the anonymous id itself, because the host is the one who knows the link is
genuine. The cookie fallback in `track` stays a fallback for `distinct_id`, and never feeds
`$anon_distinct_id`.

ADR-0011's other two objections no longer decide the question:

- **"Only one vendor would implement it."** GA4 documents a person-only request and PostHog an
  `$identify`, so there are two. The shape is the browser's optional `identify`, which ADR-0003
  already accepted as "reaching only the vendors that hold a user".
- **"It spends the host's money without asking."** It does not: the host makes the call, as often
  as it decides to.

The billing and refusal caveats move to the provider page, where the host reads them before
calling.

## Considered and rejected

**`ga4(…, { userProperties: [...] })`, an allow-list of names.** It looked like the third kind of
particularity. It is not needed for that: the host already builds `traits`, and choosing which
names reach GA4 is one line there, or a wrap when one tracking serves several vendors (ADR-0008).
It is a permanent option added for one host, which ADR-0008 refuses. It reopens if a second host
writes the same wrap.

**A `Record<name, 'active' | 'retired'>` on the GA4 factory, sending every name on every request
and a clear for anything missing or invalid.** It solves a real problem, a stale value surviving in
GA4, but it solves it by having the library clear values the host never mentioned. That is the
fourth row of the table. The host-side version is one line and keeps the decision visible.

**`posthog(…, { personProfiles: 'identified_only' })`.** In posthog-js that option means a person
is processed once anything identifies them or sets a property. A stateless server cannot reproduce
it: a cookie id may already belong to an identified person, and `false` would silently drop the
traits on that send. A server rule with different semantics under the vendor's name would mislead.
A host that wants personless capture passes `$process_person_profile: false` in the data of a
PostHog-only tracking, as it can today. This reopens on its own terms if a host with a mixed
tracking needs it.

**Refusing a `distinct_id` over 200 characters.** See the rule above: it would drop an accepted
event.

**`anonymousId` through a forged `ph_<key>_posthog` cookie.** ADR-0007 would allow it, since it is
a host's own value in the vendor's channel. It is rejected because it makes every host learn
PostHog's cookie encoding, which is the vendor knowledge this library exists to hold. It also cannot
express the merge, which must never be read from a cookie.

**A consent check before `user_data`.** Settled in `AGENTS.md`. Restated only because the request
asked for it.

**GA4 `device` on the server.** It is documented, but no host has sent it yet and the verification
it needs has not been designed. It comes with the first host that does, argued on its own.

## Verification each change owes (ADR-0004)

| Change | Captured request | Vendor's own report | Notes |
| --- | --- | --- | --- |
| PostHog `identify`, merge | `$identify` with `$anon_distinct_id` and `$set`/`$unset` | Events captured under `anonymousId` appear on the identified person; properties set | A refused merge is only an ingestion warning, so check the warnings page too |
| `null` → PostHog `$unset` | Both halves | The property is gone from the person | |
| `null` → GA4 clear (later patch, per half) | MP `{ value: null }`; `gtag('set', 'user_properties', …)` | The property is cleared for that user | Each half separately; until it passes, that half reports the omission |
| GA4 `identify` | Body with no events | Validation endpoint accepts it; the user property appears for that `user_id` | |
| GA4 over 25 properties | Every supplied property sent, plus the warning | Not claimed | Which properties survive is Google's; claim nothing without live collection evidence |
| `traitsAt` | `timestamp_micros` per property | Validation endpoint accepts it | Ordering effects in reports cannot be confirmed; claim acceptance only |
| `userProvidedData` | `user_data` hashed | Validation endpoint accepts it | Matching is not exposed in any report and must not be claimed |
| `reset()` | The `gtag` and `posthog` calls from the built library, desktop user agent | Sign out, sign in as another user: PostHog shows the next events on the second person only, and GA4 shows them under the second `user_id` | With consent re-applied after the reset |
| `engagement_time_msec` | The sent value | Validation endpoint accepts it | |
| `signal`, 200-character report, value-length report | Unit tests | Not applicable: nothing new reaches a vendor | |

## Order of delivery

Each step ships alone, on both halves where it has two, with its own changeset:

1. `signal`; the PostHog 200-character report; GA4 keeping `engagement_time_msec`. No new concept,
   no live unknown.
2. Trait semantics: `null` as PostHog `$unset` and as a reported omission on GA4; GA4's limits
   reported; `traitsAt`; the optional `report` on browser `identify`.
3. `anonymousId`.
4. Server `identify` (PostHog, then GA4), browser `reset()`, and `reset` on `consentedTracking`.
5. GA4 `userProvidedData`.

GA4's `null` as a clear follows, per half, whenever that half's live check passes. X, still next in ADR-0003's order,
is unaffected: its server identity travels with each event, and the browser adapter keeps sending
none, for ADR-0003's reason.

## Consequences

- ADR-0011's section "Why not `identify` on `ServerProvider` either" and the host-only half of its
  decision are superseded. Its refusal of a merge inside `track` stands.
- ADR-0003's sentence "Here there is no `identify`" is amended. The reason it gave, that a server
  instance must hold nothing, still holds: identity travels in the call.
- The surface added is one method per half, three optional context fields, one meaning for `null`,
  one optional callback, and one factory option. Every one of them is something a hand-written
  integration writes. None of them gives the library a reason to know who should be cleared,
  merged, selected or consented.
