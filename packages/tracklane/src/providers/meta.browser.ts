// Through the public entry point, exactly as a provider written elsewhere
// would import it. A provider that needs something not exported here is
// telling us the contract is incomplete, which is a conversation rather than
// a reason to reach inside.
import type {
  BrowserProvider,
  ConsentState,
  EventBinding,
  EventData,
  EventItem,
  TrackOptions,
} from '../index.js';

interface FbqWindow {
  fbq?: (...args: unknown[]) => void;
}

/**
 * The names Meta accepts through `fbq('track')`. Anything else is a custom
 * event and goes through `trackCustom`, which is a different command rather
 * than a different argument.
 *
 * Seventeen standard events plus `PageView`, which Meta documents separately
 * from the seventeen and which the base snippet fires by itself.
 */
const STANDARD_EVENTS: readonly string[] = [
  'AddPaymentInfo',
  'AddToCart',
  'AddToWishlist',
  'CompleteRegistration',
  'Contact',
  'CustomizeProduct',
  'Donate',
  'FindLocation',
  'InitiateCheckout',
  'Lead',
  'PageView',
  'Purchase',
  'Schedule',
  'Search',
  'StartTrial',
  'SubmitApplication',
  'Subscribe',
  'ViewContent',
];

/**
 * How Meta spells the canonical vocabulary, which is GA4's.
 *
 * Only canonical names appear here. Meta has eight more standard events with
 * no GA4 counterpart (`Subscribe`, `StartTrial`, `Schedule`, `Contact`,
 * `Donate`, `FindLocation`, `CustomizeProduct`, `SubmitApplication`), and
 * inventing canonical names for them would make this library the author of a
 * vocabulary it deliberately borrows. A host that fires those maps its own
 * event name to them through `events`.
 *
 * A canonical event with no standard counterpart is **not** dropped: it goes
 * to `trackCustom` under its own name, because by hand that event would have
 * been sent.
 */
const CANONICAL_EVENTS: Record<string, EventBinding<string>> = {
  page_view: 'PageView',
  view_item: 'ViewContent',
  search: 'Search',
  add_to_cart: 'AddToCart',
  add_to_wishlist: 'AddToWishlist',
  begin_checkout: 'InitiateCheckout',
  add_payment_info: 'AddPaymentInfo',
  purchase: 'Purchase',
  sign_up: 'CompleteRegistration',
  generate_lead: 'Lead',
};

/** Optional configuration for the Meta browser provider. */
export interface MetaBrowserConfig {
  /**
   * How this pixel spells each canonical event, merged over the built-in map.
   *
   * This is how the eight standard events with no GA4 counterpart are
   * reached, and how an event is kept out of Meta entirely with `null`.
   */
  events?: Record<string, EventBinding<string>>;
}

// Server rendering reaches this module with no browser at all, where
// `window` is a ReferenceError rather than `undefined`.
function fbqWindow(): FbqWindow | undefined {
  return typeof window === 'undefined' ? undefined : (window as unknown as FbqWindow);
}

/**
 * Sends a command, or fails the way a hand-written call would.
 *
 * Writing `fbq(…)` on a page without Meta's snippet throws, and this library
 * replicates that rather than swallowing it: a silent no-op is how a host
 * ends up believing it is measuring something.
 */
function push(...args: unknown[]): void {
  const fbq = fbqWindow()?.fbq;

  if (!fbq) {
    throw new Error(
      "meta: window.fbq is not defined. Add Meta's pixel to the page before creating tracking.",
    );
  }

  fbq(...args);
}

/**
 * GA4's `items` become Meta's `contents`, which is a closed shape: `id`,
 * `quantity`, `item_price` and `delivery_category`, and nothing else.
 *
 * The rest of a GA4 item, `item_name` and `item_brand`, is dropped rather than
 * forwarded, because a key Meta does not read inside `contents` looks mapped
 * and arrives nowhere. That is the failure mode this project keeps finding.
 */
function contents(items: readonly EventItem[]): Record<string, unknown>[] {
  return items.map((item) => {
    const content: Record<string, unknown> = {};

    if (item.item_id !== undefined) content.id = item.item_id;
    if (item.quantity !== undefined) content.quantity = item.quantity;
    if (item.price !== undefined) content.item_price = item.price;

    return content;
  });
}

/**
 * `value` and `currency` are spelled identically by both vendors, so they
 * pass through untouched. Everything the host named itself passes through
 * too: Meta keeps unknown keys as custom properties, which is exactly what a
 * hand-written call would have produced.
 *
 * `transaction_id` stays under its own name here. Meta's pixel documents no
 * order id among its object properties. `order_id` exists on the Conversions
 * API and not on this surface, so translating it would be inventing a slot.
 */
function pixelParams(data: EventData): Record<string, unknown> {
  const { items, ...rest } = data;
  const params: Record<string, unknown> = { ...rest };

  if (items) params.contents = contents(items);

  return params;
}

/**
 * Meta's pixel has one consent switch where this library carries Google's
 * four signals, so the four are collapsed into it.
 *
 * The collapse is the strictest declared answer: any `denied` produces
 * `revoke`, and `grant` needs every declared signal to be `granted`. There is
 * no field to partition, so this is the only reduction that cannot widen a
 * denial, and widening is the one thing a projection must never do.
 *
 * A host that wants Meta to follow only its advertising category, and not its
 * analytics one, decides that before `createTracking` by leaving this
 * provider out, which is what `@tracklane/consent` exists to do.
 */
function collapse(state: ConsentState): 'grant' | 'revoke' | undefined {
  const signals = [
    state.ad_storage,
    state.analytics_storage,
    state.ad_user_data,
    state.ad_personalization,
  ].filter((signal) => signal !== undefined);

  // Nothing declared produces no command. Reading silence as either answer
  // puts words in the visitor's mouth.
  if (signals.length === 0) return undefined;

  return signals.every((signal) => signal === 'granted') ? 'grant' : 'revoke';
}

/**
 * The Meta pixel in the browser, through `fbq`.
 *
 * **This provider does not load Meta's pixel.** The base code belongs on the
 * page, installed the way
 * [Meta documents it](https://developers.facebook.com/docs/meta-pixel/get-started):
 * a snippet in the HTML, or a tag manager. This library talks to the pixel
 * that is already there; it never injects a third-party script and never
 * issues `fbq('init')`.
 *
 * Three consequences follow from that, and all three are Meta's rules rather
 * than ours:
 *
 * - **There is no `identify` here.** Meta accepts advanced matching only in
 *   the base code ("be sure to place advanced matching parameters in the
 *   pixel base code or the values will not be treated as manual advanced
 *   matching values"), and the base code is yours. Put `em`, `ph`, `fn`, `ln`
 *   in your own `fbq('init')`, where the pixel normalises and hashes them for
 *   you. On the server, where there is no snippet, the same identity travels
 *   in `context.user` and is hashed by the adapter.
 * - **The initial consent declaration is not ours.** Meta wants
 *   `fbq('consent', 'revoke')` before `init`, and by the time you hold what
 *   `createTracking` returns that moment has passed. Ours is every
 *   declaration after it, through `consent()`.
 * - **Limited Data Use is not ours either.** `fbq('dataProcessingOptions', …)`
 *   is documented as running before `init`. It belongs in your snippet. The
 *   server half, which has no snippet, carries it on its factory.
 *
 * **There is no pixel id here**, and that is deliberate rather than an
 * omission. `fbq('track')` reaches every pixel the page initialised, so an id
 * passed in would address nothing and the parameter would promise something
 * this adapter cannot deliver. Which pixels exist is declared by your snippet,
 * in `fbq('init')`.
 *
 * @param config - Event name overrides, merged over the built-in map.
 * @returns A provider for `createTracking` from `tracklane/browser`.
 *
 * @example
 * ```ts
 * import { createTracking, meta } from 'tracklane/browser';
 *
 * // Meta's own base code is already in the page, and it named the pixel.
 * const { track } = createTracking({ providers: [meta()] });
 *
 * // fbq('track', 'Purchase', { value: 49.9, currency: 'BRL' }, { eventID: 'T-1' })
 * track('purchase', { value: 49.9, currency: 'BRL' }, { dedupId: 'T-1' });
 * ```
 */
export function meta(config: MetaBrowserConfig = {}): BrowserProvider {
  return {
    name: 'meta',
    // An event Meta has no standard name for is still an event Meta accepts,
    // through `trackCustom`. Nothing is silently dropped.
    default: 'passthrough',
    events: { ...CANONICAL_EVENTS, ...config.events },

    track(name: string, data: EventData, options: TrackOptions): void {
      // `track`, which is what a hand-written call is, and the only form Meta
      // documents the deduplication object for.
      //
      // `trackSingle` exists and would address one pixel, the way GA4's
      // `send_to` does. It was used here and then abandoned: Meta publishes no
      // signature for `trackSingle` carrying `{ eventID }`, so the placement
      // that deduplication depends on had no contract behind it. It worked when
      // verified against a real pixel, and an undocumented shape that works
      // today can stop working with no error and no visible symptom — the
      // browser and server hits would simply both count.
      //
      // The cost is Meta's own: on a page with two pixels initialised, `track`
      // reaches both. That is what `fbq('track')` does by hand, so this
      // replicates it rather than deciding otherwise on the host's behalf.
      const command = STANDARD_EVENTS.includes(name) ? 'track' : 'trackCustom';
      const args: unknown[] = [command, name, pixelParams(data)];

      // Meta's key is `eventID` here and `event_id` on the Conversions API,
      // matched together with the event name. The library never invents the
      // value: only one the host already owns can match on both sides.
      if (options.dedupId !== undefined) args.push({ eventID: options.dedupId });

      push(...args);
    },

    consent(_command: 'default' | 'update', state: ConsentState): void {
      // Meta has one consent command and no equivalent of Google's
      // default/update split, so the command maps to nothing. What is
      // declared is the state, and that is what is forwarded.
      const answer = collapse(state);
      if (answer) push('consent', answer);
    },
  };
}
