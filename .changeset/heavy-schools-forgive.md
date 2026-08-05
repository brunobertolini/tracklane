---
'@tracklane/consent': minor
---

`Consent` gains `forget()`, so a preference screen can erase the visitor's answer without reaching
past the store. It clears the record, returns `answered` to `false`, resets `state` to the
configured defaults and notifies subscribers; through `consentedTracking` it also recomposes the
provider list and re-signals the defaults to the vendors that take a consent command, in the same
order `answer` uses.

`ConsentStorage.forget()` already erased the cookie, but nothing was notified, so the UI and the
live provider list stayed on the previous answer until a reload.

**This is not how consent is withdrawn.** Withdrawal is `answer` with the denials, which records a
decision and forwards it. Forgetting returns the visitor to your configured defaults, so where
those are `granted` it re-enables the categories a denial had switched off, until they answer
again. Reasoning in `docs/decisions/0010-forgetting-a-consent-answer.md`.

Adding a member to the exported `Consent` interface is breaking only for a host that implements
that interface itself rather than calling `createConsent`, which is not a documented path.
