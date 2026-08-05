# ADR-0010 — Forgetting a consent answer, and what that is not

- **Status:** accepted
- **Date:** 2026-08-05
- **Decision context:** ADR-0006 fixed the public surface of `@tracklane/consent` and put `forget`
  on `ConsentStorage`, because erasing a cookie by hand means repeating its name and domain
  exactly. The first production adoption found the consequence: `Consent<C>` has no way to trigger
  it, so a host that erases the record directly leaves every subscriber holding the old state and
  `consentedTracking` still sending to the old provider list. The gap is real. The framing that
  came with it is not, and getting that wrong would be worse than the gap.

## The gap

`Consent<C>` exposes `state`, `answered`, `answer` and `subscribe`, and only `answer` notifies. A
preference screen offering "delete my choice" has to reach past the store to `storage.forget()`.
The cookie disappears; nothing else moves. The banner stays hidden because the component still
holds `answered: true`, and `consentedTracking` keeps the tracking instance it built from the
previous answer, so events keep reaching vendors the visitor's erased answer had allowed.

## The framing that is wrong

The report presents this as the GDPR article 7(3) requirement that withdrawing consent be as easy
as giving it, and treats "reset to no answer" as the normal control on a preference screen.

**Withdrawal is `answer({ …, denied })`, and it already works.** It records a decision, notifies,
rebuilds, and forwards the denial to every vendor documenting a consent command. That is the
compliance-facing path and nothing is missing from it.

`forget` is a different operation: erase the record so the visitor is asked again. On a project
whose configured defaults are `granted` — the ordinary shape in opt-out jurisdictions — forgetting
a denial **re-enables** the categories the visitor had denied, until they answer again. Shipping
that under the name "withdrawal" would hand hosts a control that looks like compliance and does the
opposite. The gap is worth closing; the label is not worth borrowing.

## The decision

`Consent<C>` gains `forget(): void`. It erases the stored record, returns `answered` to `false`,
resets `state` to the configured defaults, and notifies subscribers — the same contract `answer`
has, with the same rebuild behind it in `consentedTracking`, which holds its own `Consent<C>` and
will not inherit the method for free.

**Parity there means all of `answer`'s side effects, not only the rebuild.** `answer` writes to the
store, rebuilds the tracking instance, forwards the collapsed state to every vendor with a consent
command, and only then notifies its listeners, in that order and for reasons its own comment
records. A `forget` that rebuilds the provider list and skips the vendor forward would leave GA4
holding the previous denial in its consent mode while tags re-enter under granted defaults, which
is a worse state than either end of the operation.

**Reset is to the configured defaults, not to all-denied.** The defaults are what the host declared
this visitor sees before answering, and forgetting means exactly returning to before answering. An
all-denied reset would be a second, invented state that the host never configured and that
`state` is documented never to hold. A host that wants denial should say so: that is `answer`.

The TSDoc has to carry the consequence in one line, because the method name will not: forgetting
returns the visitor to your defaults, so where those are `granted` this re-enables what a denial
had switched off. To withdraw consent, call `answer` with the denials.

## Considered and rejected

**Leaving it on storage only, as ADR-0006 has it.** ADR-0006's reason for putting `forget` there
stands — the cookie's name and domain live in one place. It was never a reason for the store to
have no way to trigger it, and the adoption showed what the missing trigger costs.

**Naming it `reset` or `clear`.** `forget` is the vendor-neutral word already used on the storage
interface and the one the visitor-facing sentence uses. Two names for the same operation across two
interfaces would be worse than one imperfect name.

**Resetting to all-denied.** Safer sounding, and it invents a state the host never declared. It
would also make `forget` non-reversible in meaning: the visitor who is asked again would be asked
from a position they were never shown.

## What this does not settle

`consentedTracking` calls `createConsent({ categories })` and does not forward a `storage` option,
so a host that wants a non-default store cannot use that entry point. That is a separate gap,
noticed while writing this and not decided here.
