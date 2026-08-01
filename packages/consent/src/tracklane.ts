// The one entry point in this package permitted to know `tracklane`
// (ADR-0005, ADR-0006). Every other module here must not import it: this
// import is what keeps that boundary a fact about the code rather than a
// promise in a document.

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
export interface ConsentedTrackingOptions<C extends string> {
  /**
   * The host's own category names, and what each is before the visitor
   * answers. Nothing here fixes the names.
   *
   * A host that wants a jurisdiction to decide them passes
   * `rulesFor(region).defaults` from `@tracklane/consent-rules`, which is a
   * plain object and keeps this entry point ignorant of geography.
   */
  categories: Record<C, ConsentDecision>;
  /**
   * The vendors to send every event to. A bare entry is unconditional; a
   * wrapped one (`{ provider, needs }`) is present only while every category
   * in `needs` is granted.
   *
   * `NoInfer` so the category union comes from `categories` alone. Without
   * it, a single `needs: 'marketing'` would narrow `C` to that one name and
   * every other category would be reported as unknown.
   */
  providers: readonly GatedProvider<NoInfer<C>, BrowserProvider>[];
  /**
   * Collapses the answer into the vendor consent vocabulary, called after
   * every rebuild and forwarded to every provider documenting the command.
   *
   * Defaults to {@link toConsentState}, which reads the canonical
   * `analytics` and `marketing` names. A host using its own names supplies
   * this, or omits the forwarding entirely by passing a function returning
   * an empty object.
   */
  consent?: (state: Readonly<Record<C, ConsentDecision>>) => ConsentState;
  /** Forwarded to every `createTracking` call this makes, including every rebuild. */
  onError?: (error: TrackingError) => void;
}

/** What {@link consentedTracking} returns. */
export interface ConsentedTracking<C extends string> {
  /** Sends one event to every vendor the current answer allows. Never throws. */
  track(name: string, data?: EventData, options?: TrackOptions): void;
  /** Forwards the user to the vendors that hold one, and to nobody else. */
  identify(user: UserData, traits?: Record<string, unknown>): void;
  /**
   * The consent store: `state`, `answered`, `answer`, `subscribe`. This is
   * deliberately not `BrowserTracking.consent`: forwarding the declaration
   * to vendors is `consentedTracking`'s own job, done on every `answer`.
   */
  consent: Consent<C>;
}

/**
 * Collapses the canonical categories into the vendor consent vocabulary.
 *
 * Google's is the most granular of the five vendors, so this collapse is
 * determined rather than a choice: `analytics` becomes `analytics_storage`,
 * `marketing` becomes the three advertising signals, verbatim. A category
 * this does not recognise produces no key, because widening a coarse answer
 * would claim a permission nobody gave.
 *
 * @param state - The current answer, by category name.
 * @returns The same answer in the vocabulary `tracklane` forwards.
 *
 * @example
 * ```ts
 * toConsentState({ analytics: 'granted', marketing: 'denied' });
 * // { analytics_storage: 'granted', ad_storage: 'denied', … }
 * ```
 */
export function toConsentState(state: Readonly<Record<string, ConsentDecision>>): ConsentState {
  const analytics = state.analytics;
  const marketing = state.marketing;

  return {
    ...(analytics ? { analytics_storage: analytics } : {}),
    ...(marketing
      ? {
          ad_storage: marketing,
          ad_user_data: marketing,
          ad_personalization: marketing,
        }
      : {}),
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
 * @param options - The categories, the vendors, how to collapse the answer
 * for vendors, and an optional error channel.
 * @returns `track` and `identify`, stable across rebuilds, and the `consent`
 * store for a banner to read and answer.
 *
 * @example
 * ```ts
 * // tracking.ts
 * import { consentedTracking } from '@tracklane/consent/tracklane';
 * import { rulesFor } from '@tracklane/consent-rules';
 * import { ga4, meta } from 'tracklane/browser';
 *
 * export const { track, consent } = consentedTracking({
 *   // Or your own names and defaults; nothing here requires a jurisdiction.
 *   categories: rulesFor('BR').defaults,
 *   providers: [
 *     ga4('G-XXXXXXX'),
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
export function consentedTracking<C extends string>(
  options: ConsentedTrackingOptions<C>,
): ConsentedTracking<C> {
  const { categories, providers, onError } = options;
  const collapse = options.consent ?? toConsentState;
  const store = createConsent<C>({ categories });

  const build = (state: Readonly<Record<C, ConsentDecision>>) =>
    createTracking({
      providers: selectProviders(state, providers),
      ...(onError ? { onError } : {}),
    });

  let instance = build(store.state);

  // Listeners are held here rather than passed through to the store, so that
  // they run after the rebuild. Subscribing to the store directly would
  // notify while `instance` is still the previous one, and a listener that
  // tracks an event would send it to the providers the visitor just changed.
  const listeners = new Set<(state: Readonly<Record<C, ConsentDecision>>) => void>();

  const consent: Consent<C> = {
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
      instance.consent('update', collapse(store.state));

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
