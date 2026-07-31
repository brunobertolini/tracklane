# Research — prior art

- **Date:** 2026-07-31
- **Goal:** answer the question every README visitor asks within ten seconds — *why not use
  what already exists?* This is positioning material.
- **Deliberate boundary:** this document is **not design input**. The survey was done once,
  timeboxed, and is not revisited while the public surface is being defined. Absorbing a CDP's
  data model by osmosis is a real risk, and exactly the kind of contamination ADR-0002 exists
  to prevent.

## The four categories

### 1. CDPs — Segment, RudderStack, Jitsu, Snowplow

They collect events, resolve identity, transform and route to dozens of destinations,
typically with the data warehouse as the primary destination. RudderStack is API-compatible
with Segment's `analytics.js`; Jitsu sells on deployment simplicity; Snowplow is the strictest
on schema.

**Why it does not serve:** they are infrastructure. Even the open-source ones require a
service running, maintained and paid for — container, pipeline, queue. They solve a bigger
problem than ours and charge accordingly. Someone with five pixels in a Next.js app does not
want to operate a data pipeline; they want to stop writing the same call five times. And ad
conversion is a second-class destination in that world: the first-class citizen is the
warehouse.

### 2. Tag managers — GTM and server-side GTM

They move the integration into a container edited outside the codebase.

**Why it does not serve:** the cost is precisely what a product team does not want to pay —
tracking logic leaves the repository and moves into a dashboard, with no types, no code
review, no tests, no git history, editable in production by people who never open the repo.
Server-side GTM adds hosting on top. It is the right answer for teams who want marketing to
operate without engineering, and the wrong one for teams who want tracking to be code.

### 3. Client-side abstractions — `analytics` (DavidWells) and similar

The closest in **shape**: `Analytics({ plugins })` with `track`, `page`, `identify`, and
providers as plugins with lifecycle hooks. A good library, and proof that the format makes
sense.

**Why it does not serve:** it is browser-only. There is no path to the conversion APIs, which
are half the problem in 2026 — without them, tracker blocking and third-party cookie loss sink
measurement. Consent appears as an opt-out plugin rather than as a structured signal each
provider receives in its own way.

### 4. Single-provider libraries — `react-ga4`, `react-facebook-pixel`, `@next/third-parties`

Each wraps one provider, with decent DX inside its own scope.

**Why it does not serve:** N of them is exactly the original problem — N APIs, N vocabularies,
N places to change when the next provider arrives.

### Separate mention — walkerOS

The nearest neighbour in intent: open source, web destinations including the ad platforms,
explicit mapping of events onto `lintrk` and friends, consent as a category that unlocks a
destination. It was, incidentally, the most useful secondary source in the provider research.

**Where it diverges:** it is a collection platform with its own data model — events are
described in its terms (entity and action), and consent is a gate it operates itself, blocking
whatever lacks an unlocked category. We are the opposite on both counts: the vocabulary is
borrowed from GA4 rather than invented, and consent is passed through rather than enforced.

## The empty space

None of the four groups occupies this position: **a library, with no infrastructure, that
speaks both browser and server, is typed, translates a known vocabulary into N providers, and
has no opinion about anything else.**

The CDPs are too large and charge for infrastructure. The tag managers take tracking out of
the code. The client-side abstractions ignore half the problem. The single-provider libraries
are the problem.

## Sources

- [walkerOS — comparisons](https://www.walkeros.io/docs/comparisons/jitsu)
- [DavidWells/analytics](https://github.com/DavidWells/analytics)
- [Open source Segment alternatives](https://improvado.io/blog/open-source-segment-alternative)
- [RudderStack vs Segment](https://marketingarsenal.io/segment-vs-rudderstack/)
