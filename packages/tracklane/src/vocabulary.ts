/**
 * The vocabulary shared by the browser and server libraries.
 *
 * These two libraries never talk to each other — no runtime, no state, no
 * instance in common. What they share is this: the names of events and the
 * shape of the data that travels with them, so that `purchase` means the
 * same thing on both sides. It is the only sharing with a reason to exist.
 */

/** One item inside an ecommerce event, spelled the way GA4 spells it. */
export interface EventItem {
  item_id?: string;
  item_name?: string;
  price?: number;
  quantity?: number;
  [key: string]: unknown;
}

/**
 * The business payload of an event.
 *
 * The named fields are the ones adapters read to build vendor-specific value
 * and content slots. The index signature is deliberate: a business measures
 * things this vocabulary does not name, and closing the bag would make the
 * library the arbiter of what may be measured.
 */
export interface EventData {
  transaction_id?: string;
  value?: number;
  currency?: string;
  items?: EventItem[];
  [key: string]: unknown;
}

/**
 * Who the person is.
 *
 * One identifier for the person, which every vendor receives under its own
 * name. Values are always raw — hashing and normalisation are field formats
 * each vendor defines, applied inside the adapter that owns the field.
 *
 * Everything else that identifies someone arrives through cookies on the
 * server, read by whichever adapter knows the format.
 */
export interface UserData {
  /** One id for the person, translated per vendor. */
  userId?: string;
  email?: string;
  phone?: string;
  firstName?: string;
  lastName?: string;
  /** From the URL rather than a cookie, which is why it is named here. */
  twclid?: string;
}

/**
 * Consent signals, in Google's own spelling.
 *
 * Google's is the most granular surface any of the five vendors exposes, so
 * every other vendor receives a *collapse* of it. Carrying the finest
 * resolution and reducing per vendor means a projection never claims more
 * than the host declared — expanding a coarse answer into fine signals would
 * invent information, and this library never does that.
 *
 * An absent signal produces no key: silence is not a denial, and converting
 * it into one would put words in the visitor's mouth just as a grant would.
 */
export interface ConsentState {
  ad_storage?: 'granted' | 'denied';
  analytics_storage?: 'granted' | 'denied';
  ad_user_data?: 'granted' | 'denied';
  ad_personalization?: 'granted' | 'denied';
}

/**
 * Where a conversion happened.
 *
 * Meta's vocabulary, adopted verbatim — it is the only vendor of the five
 * that documents the concept, and it requires the field on every server
 * event. Inventing a taxonomy and translating it would be both incomplete
 * for Meta and meaningless to everyone else.
 */
export type ActionSource =
  | 'website'
  | 'app'
  | 'email'
  | 'phone_call'
  | 'chat'
  | 'physical_store'
  | 'system_generated'
  | 'business_messaging'
  | 'other';

/**
 * How a canonical event name is spelled for one vendor, or `null` to say
 * "never send this event here".
 */
export type EventBinding<Target> = Target | null;

/** What a provider does with a canonical event it has no binding for. */
export type ProviderDefault = 'passthrough' | 'ignore';

/**
 * Reported out of band, never thrown at the call site.
 *
 * Fanning out to N vendors means no single call site can catch anything, so
 * this is the replica of the `try/catch` a host would have written around a
 * hand-made call. `severity` separates "this did not arrive" from "this
 * arrived, and here is something you should know".
 *
 * It never carries event contents: the payload holds raw personal data by
 * design, and no library-owned surface re-emits it into a host's logs.
 */
export interface TrackingError {
  provider: string;
  event: string;
  severity: 'error' | 'warning';
  message: string;
  cause?: unknown;
}
