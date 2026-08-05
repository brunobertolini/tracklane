// Through the public entry point, exactly as a provider written elsewhere
// would import it. A provider that needs something not exported here is
// telling us the contract is incomplete, which is a conversation rather than
// a reason to reach inside.
import type {
  BrowserProvider,
  ConsentState,
  EventBinding,
  EventData,
  TrackOptions,
  UserData,
} from '../index.js';

/** The slice of `posthog-js` this adapter calls. */
interface PosthogSdk {
  capture: (event: string, properties?: EventData) => void;
  identify: (distinctId: string) => void;
  setPersonProperties: (properties: Record<string, unknown>) => void;
  opt_in_capturing: () => void;
  opt_out_capturing: () => void;
}

interface PosthogWindow {
  posthog?: PosthogSdk;
}

/** Optional configuration for the PostHog browser provider. */
export interface PosthogBrowserConfig {
  /**
   * How this project spells each canonical event. Rarely needed: `capture()`
   * accepts any string, so the canonical vocabulary already is PostHog's.
   */
  events?: Record<string, EventBinding<string>>;
}

// Server rendering reaches this module with no browser at all, where
// `window` is a ReferenceError rather than `undefined`.
function posthogWindow(): PosthogWindow | undefined {
  return typeof window === 'undefined' ? undefined : (window as unknown as PosthogWindow);
}

/**
 * Returns the vendor SDK, or fails the way a hand-written call would.
 *
 * Calling `posthog.capture(...)` on a page without PostHog's snippet throws,
 * and this library replicates that rather than swallowing it: a silent no-op
 * is how a host ends up believing it is measuring something.
 */
function sdk(): PosthogSdk {
  const instance = posthogWindow()?.posthog;

  if (!instance) {
    throw new Error(
      "posthog: window.posthog is not defined. Add PostHog's snippet to the page before creating tracking.",
    );
  }

  return instance;
}

/**
 * PostHog in the browser, through `posthog-js`.
 *
 * **This provider does not load PostHog's snippet.** It belongs on the page,
 * installed the way PostHog documents it: a snippet in the HTML, or a tag
 * manager. This library talks to the instance that is already there; it
 * never injects a third-party script into your page.
 *
 * @param config - Rarely needed event name overrides.
 * @returns A provider for `createTracking` from `tracklane/browser`.
 *
 * @example
 * ```ts
 * import { createTracking, posthog } from 'tracklane/browser';
 *
 * // PostHog's own snippet is already in the page.
 * const { track } = createTracking({ providers: [posthog()] });
 *
 * track('purchase', { transaction_id: 'T-1', value: 49.9, currency: 'BRL' });
 * ```
 */
export function posthog(config: PosthogBrowserConfig = {}): BrowserProvider {
  const { events } = config;

  return {
    name: 'posthog',
    default: 'passthrough',
    ...(events ? { events } : {}),

    track(name: string, data: EventData, _options: TrackOptions): void {
      // capture() accepts any string as the event name and documents no
      // browser-to-server deduplication key, so dedupId maps nowhere — the
      // same gap GA4 has, for the same reason: there is no field to put it
      // in.
      sdk().capture(name, data);
    },

    identify(user: UserData, traits?: Record<string, unknown>): void {
      // distinct_id is PostHog's only identity slot. email, phone and names
      // have no separate slot the way Meta's user_data has one for each —
      // they map to nothing here, exactly the gap GA4 has for the same
      // fields.
      if (user.userId !== undefined) sdk().identify(user.userId);
      // setPersonProperties works against whichever identity is already
      // current, so it needs no id of its own — the same shape as GA4's
      // separate `set user_properties` push.
      if (traits) sdk().setPersonProperties(traits);
    },

    consent(_command: 'default' | 'update', state: ConsentState): void {
      // opt_in_capturing/opt_out_capturing is one binary switch, local SDK
      // state, not a per-signal API — nothing like Google's four commands.
      // analytics_storage is the one signal that actually describes what
      // this toggle governs (whether PostHog stores and sends analytics
      // events at all), so it is the one signal this collapses onto. The
      // other three have no honest PostHog equivalent; folding them in too
      // would risk an ad-only denial silently switching off analytics
      // capture the visitor never objected to, so they are left alone.
      const { analytics_storage } = state;

      if (analytics_storage === 'denied') {
        sdk().opt_out_capturing();
      } else if (analytics_storage === 'granted') {
        sdk().opt_in_capturing();
      }
      // Absent: no command fires. Whatever posture the page's own PostHog
      // snippet already set — opted in by default, or opted out through
      // `opt_out_capturing_by_default` — stands, rather than being guessed at.
    },
  };
}
