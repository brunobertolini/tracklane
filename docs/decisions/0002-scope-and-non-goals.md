# ADR-0002 — Scope, provider definition and non-goals

- **Status:** accepted
- **Date:** 2026-07-31
- **Decision context:** product definition led by the owner, recorded before any API design
  and before reading prior material, so that scope is the contract the public surface is
  derived from — not the residue of it. Reviewed against provider documentation
  (`docs/research/providers.md`) and cross-checked by a second model.

## Context

An application that reports user behaviour to more than one tool faces a problem of shape,
not of difficulty:

- Every tool arrives as its own snippet or SDK, with its own event names and its own payload
  format. The application learns N vocabularies.
- Each one has, beyond the browser, a server-side path — the conversion APIs — restating the
  same information under a different contract.
- User consent is expressed differently by every tool.

The practical effect is that a tracking call stops being one line and becomes a block
repeated at every conversion point, and **adding a new tool becomes a diff across the whole
application**. The cost is not in any single integration; it is in keeping them together and
in sync.

## Decision

A library exposing **one interface** between the application and the tools that receive
events. The application declares its destinations once, at creation, and from then on emits
each event once. The library translates and distributes.

## Provider definition

> **A provider is any tool that needs to receive events about what the user does in the
> system.**

The definition is deliberately category-independent. Not "ad pixel", not "analytics
platform", not "marketing tool". If the tool has a notion of `track()`, it is a valid
destination — a conversion pixel, a product analytics tool, a data warehouse or a company's
own internal service all come through the same door.

This is the definition the provider contract is derived from. A contract designed only
around ad pixels would fit four of the five v1 providers and would have to be widened later;
widening a public interface after the fact is precisely what an integration library cannot
do cheaply.

## The rule, and the test that applies it

> **The library standardises and organises. It never changes behaviour.**

The rule states the intent. The test decides actual cases:

> **If I did not have the library, how would I write this by hand? The library replicates
> exactly that.**

Whatever reaches a provider is what that provider would have received had the application
called its SDK directly — written once instead of N times. Any proposal that cannot be
justified as "this is what I would have written by hand" is out, however complete or
convenient it looks.

**The test has a boundary.** It answers *what the provider receives*, not *how my code is
organised*. By hand, five calls in a row means a throw in the third one skips the fourth and
fifth; the library deliberately does not replicate that, because that is an artefact of
sequential code, not provider behaviour. The test governs the payload, the timing and the
protocol — not the control flow of the application that no longer exists.

## The one opinion taken

The canonical event vocabulary is **GA4's**. The application names what happened in a single
language, and each provider receives the translation into its own.

This is a DX and economics choice: some lingua franca is required for a single interface to
exist at all, and adopting the most widespread one avoids inventing a proprietary dictionary
every contributor would have to learn. The opinion begins and ends there — it is about
**event names**, not about when to emit, what to send, or to whom.

## Batteries included, and what happens when they cannot be

Translation from canonical events into each provider's vocabulary ships with the library.
Install-and-work is the default, and per-provider configuration is **additive** — it extends
the built-in mapping. Mapping an event that already exists natively replaces that event, and
only that one.

**LinkedIn and X are structurally different.** They have no event names at all: every event
is a conversion rule created by the user in the platform's dashboard, identified by an
account-specific ID. No library can ship a mapping to a number that only exists inside
someone's ad account. For these providers, explicit configuration is a precondition, not an
extension.

An unmapped canonical event on such a provider **is not sent, and is not an error.** By hand,
the situation does not arise: there is no LinkedIn call to write without a conversion ID, so
the line simply would not exist. Not sending is the faithful replica of a line that was never
written.

The one thing the library adds is visibility, because by hand the absence is visible in the
source and here it is not: a development-time warning, once per unmapped event. It changes
nothing in production, and therefore does not change behaviour.

## Consent is mapping, not policy

Consent is **another mapping, not a second feature**. The library never issues a consent
command on its own initiative and never decides when one is due. The application calls the
consent entry point when it decides to, and the library translates that one call into the
command each provider exposes — the same relationship `track` has with events.

This keeps v1 at "interface and nothing else" while still covering consent, because the
library takes on no new kind of responsibility. In particular, **timing stays with the
caller.** Google's consent mode requires its `default` to run before any measurement; by hand,
you are the one who puts that line first, and with the library you are still the one who calls
it first. The library does not need to reserve, guarantee or reason about ordering, because
ordering was never its job.

The rules that follow:

- **The canonical consent vocabulary is Google's**, for the same reason the event vocabulary
  is GA4's: it is the most granular of the five, so every other provider can receive a
  projection of it without loss, while the reverse is not true. Projections are translations,
  exactly like `purchase` → `Purchase`, and are documented and overridable.
- **Where a provider distinguishes an initial declaration from a later update, that
  distinction is exposed**, because by hand it would be written. The "not answered yet" state
  is not a third value to invent — no provider has one. It is the moment before the update.
- **Where a provider has no consent mechanism, nothing happens for that provider.** LinkedIn
  has no command; by hand the only lever is not loading the tag, which is the application's
  decision and stays the application's decision. This is the same shape as an unmapped event:
  silent in production, warned once in development.
- No queue, no buffer, no replay, and no consent state held by the library. It forwards a call
  and forgets it.

## User data and hashing

Each provider surface defines the format of its identifier fields. Meta's Conversions API
defines `em` as an SHA-256 of a normalised email; X's pixel defines `email_address` as the raw
value, hashing it itself, while its conversions API defines `hashed_email`. These are field
formats, not opinions.

**The library produces each field in the format its provider defines** — hashing where the API
defines a hashed field, sending raw where the SDK hashes on its own. By hand, this is not
optional: sending a raw email to a field defined as a hash does not fail loudly, it silently
fails to match, which is the single most common defect in these integrations.

Normalisation follows the same boundary: applied where the provider documents it, absent where
the provider does not. A rule that is written down in the provider's documentation is part of
the field's contract. Inventing one that is not written down would be an opinion, and is out.

## Delivery and failure

Emission is **fire-and-forget and silent**. Delivery, retry and resilience already belong to
each provider's SDK or API, and remain there. One provider failing does not affect the others.
The library adds no second layer of guarantee over the one that already exists.

## Deduplication

Providers that deduplicate between browser and server do it by matching an identifier that the
emitter supplies on both sides. The library **carries** that identifier into each provider's
field — `event_id` here, `conversion_id` there — and does not generate it. By hand, the same
value has to reach both the browser and the server, which makes it the application's to
produce: a value generated inside the library would differ between the two entry points and
defeat the mechanism it was meant to serve.

## Two entry points

Browser and server are separate entry points. The asymmetry between them is not a design
choice: in the browser the SDKs keep session and user state themselves; on the server no such
state exists, and user data travels with every request. The library mirrors that reality
rather than smoothing it over — smoothing it over would require the library to manage state,
which the rule forbids.

## Third-party providers

Writing a provider is a public capability from v1, not an extension bolted on later. The same
mechanism serves both possible authors: whoever publishes a package for the community, and
whoever solves an internal case that will never leave their company. Quality reference for
that experience: `better-auth`.

One practical consequence: official providers may use no shortcut unavailable to a third-party
provider. The public contract is the only contract.

## Non-goals

Permanently out of scope:

| Not this | Why |
|----------|-----|
| A consent management platform | The library consumes consent state; it does not collect, store or display it. |
| A legal compliance layer | It does not know what GDPR or LGPD are. Legal basis and privacy policy are the application's decisions. |
| Loading vendor tags | The tag belongs on the page, installed the way the vendor documents. This library talks to the tag that is there; it never injects a third-party script, and never issues the configuration command that would emit a duplicate page view. |
| Consent gating | Deciding whether a provider runs at all is the application's, exactly as it is by hand. |
| Event data validation | What may or may not be sent is the sender's decision. |
| An event taxonomy | No event is invented; the vocabulary is borrowed from GA4. |
| Queue, buffer, retry or dead-letter | Delivery belongs to the provider. |
| Provider error handling | Silence is the behaviour — the same the application would get integrating directly. |
| An analytics SDK | It collects nothing on its own, does no autocapture, and has no opinion on what to measure. |

## v1 scope

Five official providers: **GA4, Meta, PostHog, LinkedIn and X**.

Each provider is an independent increment. GA4 alone is a working MVP; the rest are additions
that do not alter the public surface.

Implementation order — **GA4 → Meta → LinkedIn → PostHog → X**:

- GA4 first, as the source of the canonical vocabulary.
- Meta second, as the pair with the most practical value.
- **LinkedIn third, deliberately out of commercial order.** It is the provider that stresses
  the contract hardest — no event names, its own identifier types, different dedup field names
  per surface — and it has to arrive while changing the contract is still cheap. PostHog,
  whose `capture()` accepts any string, is the easiest of the five to map and would validate
  almost nothing in third place; X, being close in kind to LinkedIn, validates little after
  it.

The order is chosen so that each of the first three commits can invalidate the contract. Once
three providers of different kinds fit without changing it, the remaining two are additions.

## Consequences

- The public surface is derived from this document, not the other way around. Any proposal
  contradicting the test or the non-goals is rejected without debate on merit.
- The library is auditable by reading: what leaves for each provider is a function only of what
  came in and the declared mapping.
- The gain is in shape, not capability. Nothing becomes possible that was not already — what
  changes is the cost of maintaining and of adding. That is the product, and it is enough.

## Open decisions

1. **Final package name.** See ADR-0001, open decisions.
