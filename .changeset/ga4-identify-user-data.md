---
"tracklane": patch
---

GA4 server `identify` now sends its request when it carries `user_data` (with `userProvidedData: true`) even if there is no user property to send. With neither user properties nor `user_data` it still sends nothing.
