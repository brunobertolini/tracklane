---
'@tracklane/consent-rules': minor
'@tracklane/consent': minor
---

First release of the two consent packages.

`@tracklane/consent` holds the visitor's answer in a first-party cookie whose format is public
contract, readable in devtools and by a server on every request. `@tracklane/consent-rules`
surveys what a jurisdiction requires before measurement may begin, as dated and sourced data.

Neither is a consent gate. `tracklane` still cannot decide not to send and never learns what a
consent category is: which vendors exist is decided before `createTracking`, in the host's own
code, with one entry point here doing the wiring.

The two do not depend on each other. A host that wants a jurisdiction to pick its category
defaults passes `rulesFor(region).defaults` itself.
