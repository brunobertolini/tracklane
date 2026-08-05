# ADR-0012 — Throw, report, or do not register

- **Status:** accepted
- **Date:** 2026-08-05
- **Decision context:** ADR-0007 said this record was owed now rather than once another vendor
  arrived, because four refusals already existed and had never been compared with each other. The
  first production adoption then hit a fifth case none of them covered — a vendor account without
  the scope its conversions API needs, refusing every request forever — and chose the wrong tool
  because the right one is not a tool at all.

## What already exists, and what it adds up to

| Situation | Today |
| --- | --- |
| GA4 has no `client_id` to build | throws |
| GA4 has no session id | sends, `report`s |
| PostHog can resolve no `distinct_id` | throws |
| PostHog gets a `dedupId` that is not a UUID | sends without it, `report`s |
| Meta can build no `user_data` at all | throws |
| Meta answers with warnings on an accepted event | `report`s |

Each was decided on its own and they turn out to agree, which is worth stating once so the next
one is not decided again from scratch.

## The rule

**Throw when nothing was sent. `report` when something was sent and the caller should know
something about it. Never the other way round.**

That is the whole distinction, and everything else follows from it. A throw means "this event does
not exist at the vendor". A `report` means "it arrived, and here is a caveat" — the missing GA4
session, the dropped `dedupId`, Meta's warnings on an accepted payload.

The dispatcher isolates both, both reach the same `onError`, and neither reaches the caller of
`track`. What differs is the claim being made, not the delivery. Which is why swapping them is
worse than it looks: a `report` on something that never left teaches a host that its diagnostics
are advisory, and by the time that matters the channel is already ignored.

Two consequences already visible in the shipped providers:

**A precondition the vendor requires and the library cannot invent is a throw**, every time. All
three throws above are that case, and ADR-0007 covers why inventing the missing value instead is
refused.

**Something the vendor accepted and will quietly not use is a `report`.** These are the ones a
status code cannot tell you about, which is the whole reason the channel exists.

## The case that is neither

A LinkedIn account whose `rw_conversions` scope has not been approved refuses every conversion,
permanently, until somebody changes something in a dashboard. The adopter that hit this had two
options and correctly said both were wrong. Throwing puts a red line against every purchase, which
trains everyone to ignore the channel. `report`ing claims the event arrived, which is false.

**Neither, because this is not an event-time condition at all.** It is the configuration being
wrong, and the honest answer is that the provider should not be registered until the account can
receive. That is also what the governing test produces: nobody hand-writes a call to an API their
credentials cannot reach and then classifies the failure.

So: **a permanent, account-level refusal is a registration decision, not a send-time one.** Leave
the provider out of the `providers` array while the account cannot accept, exactly as a host leaves
out a vendor it has not signed up for. `@tracklane/consent` already composes a provider list per
visitor for a different reason; composing it per environment is the same move.

This gets documented rather than built. There is no flag, no `expected: true`, no third severity.
A lever that lets a host declare "these failures are fine" is a lever that eventually hides a
failure that was not.

## Considered and rejected

**A third severity, or an `expected` marker on the error.** It would let a host silence a class of
failure without leaving the provider registered, which sounds tidier and is worse: the events still
do not exist, and now nothing says so. The silence would be permanent and invisible, which is the
failure mode this project spends most of its rules avoiding.

**Downgrading a permanent refusal to a warning inside the adapter.** The adapter cannot tell a
missing scope from an outage, and guessing wrong in either direction is bad: an outage silenced, or
a permanent misconfiguration reported forever.

**Retry or circuit-breaking after repeated refusals.** Out of scope by ADR-0002, and it would
convert a configuration error into a slow one.

## What this does not settle

Whether a host should be able to discover this cheaply. Registering a provider whose account cannot
receive is a mistake you find in `onError` on the first conversion, which is late but visible.
Something that checks at construction would need a vendor call per provider at startup, which is a
different kind of cost and has not been argued for by anyone yet.
