// The one entry point in this package permitted to know `tracklane`
// (ADR-0005, ADR-0006). Every other module here must not import it: this
// import is what keeps that boundary a fact about the code rather than a
// promise in a document.

import type { ConsentPurpose } from '@tracklane/consent-rules';
import { rulesFor } from '@tracklane/consent-rules';
import type {
  BrowserProvider,
  ConsentState,
  EventData,
  TrackingError,
  TrackOptions,
  UserData,
} from 'tracklane';
import { createTracking } from 'tracklane/browser';
import type { Consent, GatedProvider } from './browser.js';
import { createConsent, selectProviders } from './browser.js';
import type { ConsentDecision } from './vocabulary.js';

/** Options accepted by {@link consentedTracking}. */
export interface ConsentedTrackingOptions {
  /**
   * ISO 3166-1 alpha-2, optionally with a subdivision (`'US-CA'`). Fixes
   * this call's categories to `analytics` and `marketing`, taken from
   * `rulesFor(region).defaults`. Region detection stays the host's
   * (ADR-0005); this only takes the code.
   */
  region: string;
  /**
   * The vendors to send every event to. A bare entry is unconditional; a
   * wrapped one (`{ provider, needs }`) is present only while every category
   * in `needs` is granted.
   */
  providers: readonly GatedProvider<ConsentPurpose, BrowserProvider>[];
  /** Forwarded to every `createTracking` call this makes, including every rebuild. */
  onError?: (error: TrackingError) => void;
}

/** What {@link consentedTracking} returns. */
export interface ConsentedTracking {
  /** Sends one event to every vendor the current answer allows. Never throws. */
  track(name: string, data?: EventData, options?: TrackOptions): void;
  /** Forwards the user to the vendors that hold one, and to nobody else. */
  identify(user: UserData, traits?: Record<string, unknown>): void;
  /**
   * The consent store: `state`, `answered`, `answer`, `subscribe`. This is
   * deliberately not `BrowserTracking.consent`: forwarding the declaration
   * to vendors is `consentedTracking`'s own job, done on every `answer`.
   */
  consent: Consent<ConsentPurpose>;
}

/**
 * Google's is the most granular vocabulary any of the five vendors exposes,
 * so this collapse is determined, not a choice made per host: `analytics`
 * becomes `analytics_storage`, `marketing` becomes the three advertising
 * signals, verbatim.
 */
function translate(state: Readonly<Record<ConsentPurpose, ConsentDecision>>): ConsentState {
  return {
    analytics_storage: state.analytics,
    ad_storage: state.marketing,
    ad_user_data: state.marketing,
    ad_personalization: state.marketing,
  };
}

/**
 * Wires consent to `tracklane`: rebuilds the tracking instance when the
 * answer changes, forwards the new state to every vendor that documents a
 * consent command, and keeps a stable `track` for the rest of the
 * application to import.
 *
 * **`install` may run more than once.** Rebuilding calls `createTracking`
 * again, which installs every configured provider, including ones already
 * present. No official `tracklane` provider is affected, because none of
 * them install anything; a provider written elsewhere that uses `install`
 * must be idempotent.
 *
 * **A provider entering after an `identify` never received it, and nothing
 * replays it.** No queue, no buffer, and holding the last identity in memory to
 * resend would be the retained-identity hazard the server surface was
 * designed to avoid. Call `identify` again after the answer if a
 * late-entering provider needs to know who the visitor is.
 *
 * **Revocation is not retroactive.** Under an opt-out region, a vendor's tag
 * may already have fired before the visitor refuses. Recomposition stops
 * future events only; the tag stays on the page, because tags were never
 * this library's to remove.
 *
 * @param options - The region, the vendors, and an optional error channel.
 * @returns `track` and `identify`, stable across rebuilds, and the `consent`
 * store for a banner to read and answer.
 *
 * @example
 * ```ts
 * // tracking.ts
 * import { consentedTracking } from '@tracklane/consent/tracklane';
 * import { ga4, meta } from 'tracklane/browser';
 *
 * export const { track, consent } = consentedTracking({
 *   region: 'BR',
 *   providers: [
 *     ga4('G-KARVI'),
 *     { provider: meta('1234567890'), needs: 'marketing' },
 *   ],
 * });
 * ```
 *
 * ```ts
 * // banner.ts
 * import { consent } from './tracking.js';
 *
 * if (!consent.answered) {
 *   accept.onclick = () => { consent.answer({ analytics: 'granted', marketing: 'granted' }); hide(); };
 *   refuse.onclick = () => { consent.answer({ analytics: 'granted', marketing: 'denied' }); hide(); };
 * }
 * ```
 */
export function consentedTracking(options: ConsentedTrackingOptions): ConsentedTracking {
  const { region, providers, onError } = options;
  const rules = rulesFor(region);
  const store = createConsent<ConsentPurpose>({ categories: rules.defaults });

  const build = (state: Readonly<Record<ConsentPurpose, ConsentDecision>>) =>
    createTracking({
      providers: selectProviders(state, providers),
      ...(onError ? { onError } : {}),
    });

  let instance = build(store.state);

  // Listeners are held here rather than passed through to the store, so that
  // they run after the rebuild. Subscribing to the store directly would
  // notify while `instance` is still the previous one, and a listener that
  // tracks an event would send it to the providers the visitor just changed.
  const listeners = new Set<(state: Readonly<Record<ConsentPurpose, ConsentDecision>>) => void>();

  const consent: Consent<ConsentPurpose> = {
    get state() {
      return store.state;
    },
    get answered() {
      return store.answered;
    },
    // Recording the answer and recomposing always happen together: the
    // owner of one owns the other, so there is no separate `subscribe` and
    // no separate `rebuild` in the host's own code.
    answer(record) {
      store.answer(record);
      instance = build(store.state);
      // Presence (rebuilding) and signalling are different mechanisms: GA4
      // stays configured regardless and reads this to run cookieless; Meta
      // has no such command and is only ever included or excluded above.
      instance.consent('update', translate(store.state));

      for (const listener of listeners) listener(store.state);
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };

  return {
    track: (name, data, trackOptions) => instance.track(name, data, trackOptions),
    identify: (user, traits) => instance.identify(user, traits),
    consent,
  };
}
