# @tracklane/consent-rules

> What a jurisdiction requires before measurement may begin, as dated data.

## This is not legal advice

**Read this before you install it.** This package is a survey of published law and regulator
guidance, written by software engineers and not reviewed by a lawyer. It is dated, it carries the
source it was read from, and it will go out of date.

It tells you what a regime appears to require. It cannot tell you whether your particular site,
in your particular business, is compliant. If the answer matters to you, and it usually does, have
somebody qualified read it. The authority that fines you is not a party to this licence, and the
controller of the data is you.

Every rule set carries a `source`. Read them. Where this package and the law disagree, the law is
right.

## What it does

```bash
pnpm add @tracklane/consent-rules
```

```ts
import { rulesFor, surveyedAt } from '@tracklane/consent-rules';

rulesFor('BR');
// { mode: 'opt-out',
//   offer: ['marketing'],
//   defaults: { analytics: 'granted', marketing: 'granted' },
//   source: 'Lei nº 13.709/2018 (LGPD), arts. 7º e 8º, …' }

rulesFor('DE');
// { mode: 'opt-in',
//   offer: ['analytics', 'marketing'],
//   defaults: { analytics: 'denied', marketing: 'denied' },
//   source: 'Telekommunikation-Digitale-Dienste-Datenschutz-Gesetz (TDDDG), §25, …' }

surveyedAt; // '2026-08'
```

Three answers and nothing else: whether measurement may begin before you ask, which purposes the
visitor must be offered a choice about, and what each one defaults to.

`offer` and `defaults` are separate because one field cannot carry both facts. In Brazil, analytics
defaults to granted **and** owes the visitor no choice, while marketing defaults to granted **and**
owes one.

## What it never does

It names no vendor, contains no function, and cannot answer "may this be sent". It does not
geolocate: you pass a region code, and how you obtained it is yours. An unknown region returns the
strictest surveyed configuration, and says so in its `source`.

## Coverage

`BR`, `DE` and `US-CA`, plus the strict fallback for everything else. That is a starting point, not
a claim of global coverage, and a visitor in France or Japan currently gets the fallback: opt-in,
everything denied until answered. Conservative, and possibly stricter than that jurisdiction
requires.

Contributions of surveyed jurisdictions are welcome, with the source that supports them.

## Documentation

https://tracklane.codar.me/docs/consent/rules/

MIT © Bruno Bertolini
