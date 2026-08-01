/**
 * Types only: the vocabulary shared by `./browser` and `./server`, plus what
 * each returns.
 *
 * The runtime lives behind `@tracklane/consent/browser` and
 * `@tracklane/consent/server`. They share the cookie format (ADR-0006) and
 * nothing else: no store, no instance, no state in common.
 *
 * `@tracklane/consent/tracklane` is a fourth, separate entry point that
 * additionally knows `tracklane` itself. Its types are not re-exported here,
 * so importing this package's types never pulls in a `tracklane` peer
 * dependency a host did not ask for.
 *
 * @packageDocumentation
 */

export type {
  Consent,
  ConsentStorage,
  CookieStorageOptions,
  CreateConsentOptions,
} from './browser.js';
export type { GatedProvider } from './select.js';
export type { ReadConsentOptions, ReadConsentResult } from './server.js';
export type { ConsentDecision } from './vocabulary.js';
