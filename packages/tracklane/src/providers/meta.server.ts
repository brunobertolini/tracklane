// Through the public entry point, exactly as a provider written elsewhere
// would import it. A provider that needs something not exported here is
// telling us the contract is incomplete, which is a conversation rather than
// a reason to reach inside.
import type {
  ActionSource,
  EventBinding,
  EventData,
  EventItem,
  ResolvedContext,
  ServerProvider,
} from '../index.js';

const GRAPH = 'https://graph.facebook.com';

/**
 * Pinned on purpose. A Graph URL with no version resolves to the *oldest*
 * version still available, which silently changes what the endpoint accepts
 * the day Meta drops it.
 */
const DEFAULT_API_VERSION = 'v25.0';

/**
 * How Meta spells the canonical vocabulary, which is GA4's. Kept in step with
 * `meta.browser.ts` by hand: the two halves are two libraries, and neither
 * imports the other.
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

/** Credentials for Meta's Conversions API. */
export interface MetaServerCredentials {
  /** The pixel (dataset) id events are posted to. */
  pixelId: string;
  /** A system user or page access token with `ads_management`. It is a credential. */
  accessToken: string;
}

/** Optional configuration for the Meta server provider. */
export interface MetaServerConfig {
  /** How this pixel spells each canonical event, merged over the built-in map. */
  events?: Record<string, EventBinding<string>>;
  /**
   * Where conversions happen by default. Meta requires `action_source` on
   * every event, so there is always a value; `context.source` overrides it
   * per call, which is what a webhook and a checkout need.
   */
  actionSource?: ActionSource;
  /** The Graph API version in the URL. Defaults to a pinned one. */
  apiVersion?: string;
  /**
   * Routes events to the Test Events tab in Events Manager instead of the
   * live dataset. **Testing only**: Meta says to remove it before
   * production, and it is the only instrument that shows what a payload
   * actually became.
   */
  testEventCode?: string;
  /**
   * Meta's Limited Data Use marking, forwarded verbatim: `['LDU']` to enable
   * it, `[]` to disable it.
   *
   * This is a processing marking that some US state laws require, not a
   * consent declaration, which is why it is configuration on this factory and
   * not a reading of `context.consent`. The browser half has no equivalent:
   * `fbq('dataProcessingOptions', …)` is documented as running before
   * `fbq('init')`, and the snippet is the host's.
   */
  dataProcessingOptions?: readonly string[];
  /** `0` lets Meta geolocate. Meaningless without `dataProcessingOptions`. */
  dataProcessingOptionsCountry?: number;
  /** `0` lets Meta geolocate. Meaningless without `dataProcessingOptions`. */
  dataProcessingOptionsState?: number;
}

/**
 * Web Crypto rather than `node:crypto`, so the built server bundle stays
 * platform-neutral: this adapter is called from Cloudflare Workers, Deno and
 * Vercel's edge runtime as often as from a Node process, and a `node:` import
 * would rule those out for no gain.
 */
async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));

  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * **Why the adapter hashes and does not ask the host to.**
 *
 * This looks like the library transforming data, and the cutting rule forbids
 * that. It is not. Meta does not define a field called "email" that happens
 * to want a hash: it defines `em` *as* the SHA-256 of the trimmed, lowercased
 * address, the same way it defines `event_time` as seconds rather than
 * milliseconds. Writing this line by hand you write
 * `sha256(email.trim().toLowerCase())`, and the adapter replicates exactly
 * that. Normalisation lives with the field it belongs to.
 *
 * The alternative is worse and is where integrations demonstrably go wrong:
 * three vendors want SHA-256 under three different normalisation rules, so a
 * host hashing on its own side has to hash the same address three ways and
 * discovers a mistake only as a quietly poor match rate.
 */
const normaliseEmail = (value: string): string => value.trim().toLowerCase();

/**
 * "Remove symbols, letters, and any leading zeros." The country code is not
 * added here: Meta wants one and the library does not know it, and guessing a
 * country onto a phone number invents an identifier for a different person.
 */
const normalisePhone = (value: string): string => value.replace(/\D/g, '').replace(/^0+/, '');

/** "Lowercase only with no punctuation." Spaces and accents survive; Meta reads UTF-8. */
const normaliseName = (value: string): string =>
  value
    .trim()
    .toLowerCase()
    .replace(/[\p{P}\p{S}]/gu, '');

/**
 * GA4's `items` become Meta's `contents`, a closed shape: `id`, `quantity`,
 * `item_price`, `delivery_category`. The rest of a GA4 item is dropped rather
 * than forwarded, because a key Meta does not read inside `contents` looks
 * mapped and arrives nowhere.
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
 * `value` and `currency` are spelled identically by both vendors. Everything
 * the host named itself passes through, because a business measures things
 * this vocabulary does not name.
 *
 * `transaction_id` becomes `order_id`, which this surface documents and the
 * pixel does not. It is one of the asymmetries between Meta's two halves an
 * adapter absorbs so nobody else has to.
 */
function customData(data: EventData): Record<string, unknown> {
  const { items, transaction_id: transactionId, ...rest } = data;
  const custom: Record<string, unknown> = { ...rest };

  if (transactionId !== undefined) custom.order_id = transactionId;
  if (items) custom.contents = contents(items);

  return custom;
}

/**
 * The heaviest surface of the five vendors: four hashed identifiers, four raw
 * ones, and two cookies forwarded exactly as the pixel wrote them.
 *
 * Built in a fixed order, and hashed one after another rather than in
 * parallel, so that the same input produces the same JSON on every run. Two
 * identical events differing only in key order would be the library inventing
 * something, which is precisely what the conformance suite looks for.
 */
async function userData(context: ResolvedContext): Promise<Record<string, string>> {
  const user = context.user ?? {};
  const built: Record<string, string> = {};

  const hashed: readonly [string, string | undefined, (value: string) => string][] = [
    ['em', user.email, normaliseEmail],
    ['ph', user.phone, normalisePhone],
    ['fn', user.firstName, normaliseName],
    ['ln', user.lastName, normaliseName],
  ];

  for (const [field, raw, normalise] of hashed) {
    if (raw === undefined) continue;

    const normalised = normalise(raw);
    // An empty value still hashes to a perfectly valid digest, one that
    // matches nobody and counts as an identifier towards the minimum below.
    if (!normalised) continue;

    built[field] = await sha256(normalised);
  }

  // Raw by Meta's own instruction. `external_id` is the one it merely
  // *recommends* hashing, and it stays raw here so the value Meta receives is
  // the value the host holds. A host that also puts an external id in its
  // `fbq('init')` should know the pixel hashes what it finds there, so the two
  // surfaces match only if both sides send the same form: pre-hash on both,
  // or on neither. Meta's pages do not state which side should give way.
  if (user.userId !== undefined) built.external_id = user.userId;
  if (context.ip !== undefined) built.client_ip_address = context.ip;
  if (context.userAgent !== undefined) built.client_user_agent = context.userAgent;

  // Meta forwards these as-is; they are its own cookies in its own format.
  // Note what is *not* here: an `fbc` synthesised from an `fbclid` in the URL.
  // Meta documents that construction, and it needs a click timestamp the
  // library does not have, so building one would be inventing an identifier.
  const fbp = context.cookies._fbp;
  if (fbp) built.fbp = fbp;

  const fbc = context.cookies._fbc;
  if (fbc) built.fbc = fbc;

  return built;
}

/**
 * Meta's Conversions API.
 *
 * @param credentials - The pixel id and an access token.
 * @param config - Event overrides, the default action source, and Meta's own
 * levers: the API version, a test event code, and Limited Data Use.
 * @returns A provider for `createTracking` from `tracklane/server`.
 *
 * @example
 * ```ts
 * import { createTracking, meta } from 'tracklane/server';
 *
 * const { track } = createTracking({
 *   providers: [meta({ pixelId: '1234567890', accessToken: process.env.META_TOKEN! })],
 * });
 *
 * await track('purchase', order, {
 *   user: { email: order.email },
 *   cookies: request.headers.get('cookie'),
 *   dedupId: order.id,
 *   ip,
 *   userAgent,
 * });
 * ```
 */
export function meta(
  credentials: MetaServerCredentials,
  config: MetaServerConfig = {},
): ServerProvider {
  const { pixelId, accessToken } = credentials;
  const { actionSource = 'website', apiVersion = DEFAULT_API_VERSION, testEventCode } = config;

  return {
    name: 'meta',
    default: 'passthrough',
    events: { ...CANONICAL_EVENTS, ...config.events },

    async track(
      name: string,
      data: EventData,
      context: ResolvedContext,
      report: (message: string) => void,
    ): Promise<void> {
      const user = await userData(context);

      if (Object.keys(user).length === 0) {
        // Not withholding on policy grounds: Meta requires at least one
        // `user_data` parameter and none can be invented. Its own page says
        // "at least one of the following" over the whole list, so a bare
        // `fbp` qualifies; whether matching is any good with a non-contact
        // identifier alone is Meta's business, not this adapter's to judge.
        // Naming the vendor's own field, so searching for the error leads
        // somewhere.
        throw new Error(
          'meta: cannot build user_data, the Conversions API requires at least one identifier. Pass context.user, context.ip with context.userAgent, or the _fbp/_fbc cookies.',
        );
      }

      const event: Record<string, unknown> = {
        event_name: name,
        // Seconds, where the context carries milliseconds.
        event_time: Math.floor(context.timestamp / 1000),
        // Required on every event, which is why the factory carries a default
        // rather than letting the request fail.
        action_source: context.source ?? actionSource,
        user_data: user,
      };

      // Meta's key is `event_id` here and `eventID` on the pixel, matched
      // together with `event_name`. Never produced by the library.
      if (context.dedupId !== undefined) event.event_id = context.dedupId;
      if (context.url !== undefined) event.event_source_url = context.url;

      const custom = customData(data);
      if (Object.keys(custom).length > 0) event.custom_data = custom;

      if (config.dataProcessingOptions) {
        // Meta lists these among its *server event* parameters, alongside
        // `event_name` and `user_data`, which is why they sit inside the
        // event. No example on its pages states the level outright.
        event.data_processing_options = config.dataProcessingOptions;

        if (config.dataProcessingOptionsCountry !== undefined) {
          event.data_processing_options_country = config.dataProcessingOptionsCountry;
        }
        if (config.dataProcessingOptionsState !== undefined) {
          event.data_processing_options_state = config.dataProcessingOptionsState;
        }
      }

      // `context.traits` and `context.consent` map to nothing. Meta has no
      // person-properties slot on this endpoint, and its consent surface is a
      // browser command; the processing marking above is a different concept
      // wearing similar words.

      // Form-encoded, which is the shape Meta's own examples post, and it
      // keeps the token out of the query string. Unlike GA4, this vendor
      // offers a body slot for it, so query strings in proxy and APM logs are
      // avoidable here.
      const body = new URLSearchParams({
        data: JSON.stringify([event]),
        access_token: accessToken,
      });

      if (testEventCode) body.set('test_event_code', testEventCode);

      const response = await fetch(`${GRAPH}/${apiVersion}/${encodeURIComponent(pixelId)}/events`, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body,
      });

      if (!response.ok) {
        // The status only. The event carries raw personal data, and no
        // library-owned surface re-emits it into a host's logs.
        throw new Error(`meta: the Conversions API answered ${response.status}`);
      }

      // A body that will not parse must not turn a delivered conversion into
      // an error, which would tell a host's retry logic to send it again.
      const result = (await response.json().catch(() => null)) as {
        messages?: unknown[];
        fbtrace_id?: string;
      } | null;

      const messages = result?.messages;
      if (Array.isArray(messages) && messages.length > 0) {
        // A caveat about a send that already happened, so it reports rather
        // than throws. The count and the trace id only: Meta's warnings can
        // quote the parameter that upset it, and event contents never reach a
        // host's logs through this library.
        report(
          `accepted with ${messages.length} warning(s) from the Conversions API; read them under fbtrace_id ${result?.fbtrace_id ?? 'unknown'} in Events Manager`,
        );
      }
    },
  };
}
