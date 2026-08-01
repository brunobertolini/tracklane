# ADR-0004 — How a provider gets in

- **Status:** accepted
- **Date:** 2026-08-01
- **Decision context:** GA4 shipped on both halves and four providers remain. Everything that
  makes a provider correct today is written as prose in ADR-0003, `AGENTS.md` and the "writing a
  provider" page, and enforced by whoever is reading at the time. This record converts what can be
  mechanised into build failures, and states plainly which part cannot be.

## The problem this addresses

ADR-0003 settled what a provider is. It did not settle how one gets into the repository without
eroding the thing it defined.

Four failures are available to us, and three of them are silent:

- A provider reaches past the public contract into the core, and the contract quietly becomes a
  description of the official providers rather than of every provider.
- A provider satisfies the TypeScript interface and violates a behavioural rule the interface
  cannot express, such as inventing an identifier or expanding a consent signal.
- The documentation and the code disagree about what ships, because the same claim is written by
  hand in several places.
- A provider passes every unit test and sends nothing the vendor records, which is the failure
  this project has already met more than once.

## The contract is the only surface a provider may touch

A provider imports the types the root entry point exports and nothing else. That is already true
of GA4, which imports only types re-exported from `tracklane`, and it is true by discipline rather
than by rule.

**It becomes a rule.** A build failure when anything under `providers/` imports a symbol the
package does not export publicly.

The point is not tidiness. The site tells readers that a provider written outside this repository
uses the same contract the official ones use, and the only way that claim stays true is if the
official ones cannot do otherwise. Writing each new provider as though it lived in someone else's
repository is also the cheapest test of the contract we have: if the contract does not fit, the
build says so at the moment it stops fitting, rather than after the core has been widened to
accommodate it.

Widening the core is not forbidden. It is required to be a separate, deliberate change, argued on
its own terms, because "the LinkedIn adapter needed it" is how a contract turns into whatever the
last adapter wanted. ADR-0003 already predicts LinkedIn will press hardest here.

## Behaviour that the type system cannot check gets a shared suite

The provider interfaces constrain shape. Every rule that actually decides whether a provider is
correct is behavioural, and today each one is tested once, by hand, against GA4:

- an event mapped to `null` sends nothing
- `default: 'ignore'` sends nothing rather than guessing a name
- an unmapped event under `passthrough` sends the canonical name unchanged
- a vendor with no consent command receives nothing, and consent is only ever collapsed
- an identifier a vendor has no slot for is not translated into an invented one
- a diagnostic never carries event contents
- nothing installs a vendor tag

These are the same for every provider, so they are written once and every provider inherits them.
A new adapter opts in with a few lines and gets the whole set, and a rule that changes is changed
in one place rather than found in four.

**What shipped covers less than that list**, and the difference is worth naming rather than
leaving for someone to discover. `src/conformance.ts` asserts provider identity, that the same
call twice produces the same thing (which is how "never invents an identifier" becomes a check
rather than a promise), that a deduplication id appears only when one was given, that a consent
denial is never widened into a grant, and that a server adapter throws when its vendor refuses.
The rest of the list above is still tested per provider, against GA4. Those tests move into the
suite when a second provider makes the duplication real, which is the same condition
`.claude/rules/testing.md` sets for any shared helper.

Meta is that second provider, and it has not arrived yet. The suite was built early because the
consent work needed the invariants written down; the list above is what it grows into, not what it
is.

The development-time warning owed for `default: 'ignore'`, promised in ADR-0003 and due with
LinkedIn, is one of these behaviours and belongs in this suite.

## What ships is data, not prose repeated six times

"GA4 ships today, Meta, LinkedIn, PostHog and X are next" is currently written by hand in six
places: this repository's README, the package README, the package description, the documentation
landing page, the home page and the machine-readable index.

This has already failed. The release of 0.1.0 corrected the claim everywhere except the
machine-readable index, and the surviving overclaim was found only because three models were asked
to read the published site with no knowledge of the project. It was the first thing an LLM read
about this library, and it was wrong.

One declared list, read by the documentation and the home page, checked by a test that fails when
a provider exists in the source without being declared, or is declared as shipping when it does
not exist. Shipping a provider then moves one line instead of five, and the five cannot drift.

This is a documentation mechanism, not a runtime one. It creates no registry, no allow-list and no
enrolment step for anyone writing a provider elsewhere. ADR-0003's promise that nothing is
reserved is unaffected.

## Verification evidence is a merge requirement

This is the part that cannot be automated, and pretending otherwise is how it stops happening.

These vendors fail by accepting. A `204` means the request arrived, not that the event exists.
Every defect that mattered in GA4 was invisible to unit tests: commands queued in a shape the
vendor ignores, person properties accepted and then dropped, a session read from the wrong cookie,
a duplicate page view on every load, and a headless browser silently discarded as bot traffic.

**A provider is not merged without evidence that its events arrived**: the outgoing request as it
left the built library, and the vendor's own report showing the event. Not a status code, and not
a passing test suite. `AGENTS.md` describes how to produce this; what changes here is that it
gates the merge rather than advising the author.

Two consequences we accept:

The vendor account is the author's problem, including for outside contributors. Testing a Meta,
LinkedIn or X adapter needs an advertiser account, which is a real barrier to a drive-by
contribution. We would rather have a provider arrive slowly and verified than quickly and
plausible. The alternative on offer is a provider that unit tests approve of and that measures
nothing, which is worse than no provider at all, because it looks like measurement.

Accounts are provisioned when a provider is actually being built, not up front. The build order in
ADR-0003 is one vendor at a time, so at most one account is ever needed at once.

## What this deliberately does not do

**No path-based CI gate that blocks a pull request touching the core and a provider together.**
The import rule already catches a provider reaching into the core, which is the failure worth
catching. A gate on paths would fire on legitimate work and be waved through, and a check people
learn to wave through is worse than no check.

**No mutation testing, and no coverage threshold.** Both measure whether tests execute lines, and
every defect this project has actually met was a line that executed correctly against an
assumption that was false. The conformance suite and the vendor's own report are where that class
of defect is caught.

**No template or generator for a new provider.** Five providers is not enough repetition to earn
one, and a generator would encode today's shape at exactly the moment the remaining four are
expected to press on it.
