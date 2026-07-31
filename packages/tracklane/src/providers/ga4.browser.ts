import type { BrowserProvider, TrackOptions } from '../browser.js';
import type { ConsentState, EventBinding, EventData, UserData } from '../vocabulary.js';

interface GtagWindow {
  gtag?: (...args: unknown[]) => void;
}

/** Optional configuration for the GA4 browser provider. */
export interface Ga4BrowserConfig {
  /**
   * How this property spells each canonical event. Rarely needed: the
   * canonical vocabulary already is GA4's.
   */
  events?: Record<string, EventBinding<string>>;
}

// Server rendering reaches this module with no browser at all, where
// `window` is a ReferenceError rather than `undefined`.
function gtagWindow(): GtagWindow | undefined {
  return typeof window === 'undefined' ? undefined : (window as unknown as GtagWindow);
}

/**
 * Sends a command, or fails the way a hand-written call would.
 *
 * Writing `gtag(…)` on a page without Google's snippet throws, and this
 * library replicates that rather than swallowing it: a silent no-op is how a
 * host ends up believing it is measuring something.
 */
function push(...args: unknown[]): void {
  const gtag = gtagWindow()?.gtag;

  if (!gtag) {
    throw new Error(
      "ga4: window.gtag is not defined — add Google's tag to the page before creating tracking",
    );
  }

  gtag(...args);
}

/**
 * Google Analytics 4 in the browser, through `gtag.js`.
 *
 * **This provider does not load Google's tag.** The tag belongs on the page,
 * installed the way Google documents it — a snippet in the HTML, or a tag
 * manager. This library talks to the tag that is already there; it never
 * injects a third-party script into your page, and it never issues the
 * property configuration that would emit a second page view.
 *
 * Which also means the initial consent declaration is not ours to make:
 * Google requires it before the property is configured, and the snippet that
 * configures the property is yours. Use {@link ConsentState} through
 * `consent()` for changes after that.
 *
 * @param measurementId - The `G-` id of the data stream, matching the tag on
 * the page.
 * @param config - Rarely needed event name overrides.
 * @returns A provider for `createTracking` from `tracklane/browser`.
 *
 * @example
 * ```ts
 * import { createTracking, ga4 } from 'tracklane/browser';
 *
 * // Google's own snippet is already in the page.
 * const { track } = createTracking({ providers: [ga4('G-XXXXXXX')] });
 *
 * track('purchase', { transaction_id: 'T-1', value: 49.9, currency: 'BRL' });
 * ```
 */
export function ga4(measurementId: string, config: Ga4BrowserConfig = {}): BrowserProvider {
  const { events } = config;

  return {
    name: 'ga4',
    // The canonical names already are GA4's, so every event passes through
    // under its own name unless the host says otherwise.
    default: 'passthrough',
    ...(events ? { events } : {}),

    track(name: string, data: EventData, _options: TrackOptions): void {
      // GA4 documents no browser-to-server deduplication, so `dedupId` maps
      // to nothing here. That is the exact translation of "this concept does
      // not exist in this vendor" — inventing a param would imply a merge
      // the platform never performs.
      //
      // `send_to` is written after the host's data on purpose: without it,
      // gtag sends to every configured property on the page, so the
      // addressing is the adapter's to own and not the host's to override.
      push('event', name, { ...data, send_to: measurementId });
    },

    identify(user: UserData, traits?: Record<string, unknown>): void {
      // GA4 documents no browser slot for email, phone or names. They map to
      // nothing, which is what "this concept does not exist here" means.
      if (user.userId !== undefined) push('set', { user_id: user.userId });
      if (traits) push('set', 'user_properties', traits);
    },

    consent(command: 'default' | 'update', state: ConsentState): void {
      // Verbatim: the library's consent vocabulary is Google's own spelling,
      // so there is nothing to translate and no chance to expand a signal
      // the host did not declare.
      push('consent', command, state);
    },
  };
}
