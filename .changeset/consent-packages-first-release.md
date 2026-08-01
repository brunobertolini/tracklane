---
'@tracklane/consent-rules': minor
'@tracklane/consent': minor
---

First release of the two consent packages.

`@tracklane/consent` holds the visitor's answer in a first-party cookie whose format is public
contract, readable in devtools and by a server on every request. `@tracklane/consent-rules`
surveys what a jurisdiction requires before measurement may begin, as dated and sourced data.

Neither is a consent gate. `tracklane` still cannot decide not to send, and never learns what a
consent category is: deciding which vendors exist happens before `createTracking`, in the host's
own code, with one entry point here that does the wiring.

`@tracklane/consent-rules` is a survey and not legal advice. It covers three jurisdictions with a
strict fallback for everywhere else, and no lawyer has reviewed it. Its README opens with that.
