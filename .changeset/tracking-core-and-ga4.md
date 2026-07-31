---
'tracklane': minor
---

One interface between an application and every tool that receives user-behaviour events.

`createTracking` from `/browser` and `/server` fans an event out to every configured provider,
translating GA4's canonical vocabulary into each vendor's own. The two entry points are two
independent libraries that share only the vocabulary.

Ships the GA4 provider on both surfaces — `gtag.js` in the browser, the Measurement Protocol on
the server — plus the public `Provider` contract that third-party providers implement.

The core never withholds a send on policy grounds: it maps events, forwards consent to the
vendors that document a command for it, and decides nothing on the host's behalf.
