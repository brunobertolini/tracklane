/**
 * The vocabulary shared by the browser and server libraries.
 *
 * These two libraries never talk to each other. They share no runtime, no
 * state, no instance in common. What they share is this: the names of
 * events and the shape of the data that travels with them, so that
 * `purchase` means the same thing on both sides. This is the only overlap
 * that exists on purpose.
 */

/** One item inside an ecommerce event, spelled the way GA4 spells it. */
export interface EventItem {
  /** The SKU or catalogue id for this line. */
  item_id?: string;
  /** The product name for this line, shown in reports. */
  item_name?: string;
  /** The unit price for this line, before `quantity`. */
  price?: number;
  /** How many units of this line. */
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
  /** The order id. GA4 needs it, together with `items`, to record a purchase. */
  transaction_id?: string;
  /** The monetary amount, paired with `currency`. */
  value?: number;
  /** An ISO 4217 code. GA4 requires it whenever `value` is set. */
  currency?: string;
  /** The cart or order lines, required by GA4 alongside `transaction_id` for a purchase. */
  items?: EventItem[];
  [key: string]: unknown;
}

/**
 * Who the person is.
 *
 * One identifier for the person, which every vendor receives under its own
 * name. Values are always raw: hashing and normalisation are field formats
 * each vendor defines, applied inside the adapter that owns the field.
 *
 * Everything else that identifies someone arrives through cookies on the
 * server, read by whichever adapter knows the format.
 */
export interface UserData {
  /** One id for the person, translated per vendor. */
  userId?: string;
  /** Raw and unhashed. Adapters that need it hashed (Meta, LinkedIn) do that themselves. */
  email?: string;
  /** Raw, in whatever format the host has it. An adapter normalises it if its vendor needs to. */
  phone?: string;
  /** Raw, read only by vendors whose identity match uses names, such as Meta. */
  firstName?: string;
  /** Raw, read only by vendors whose identity match uses names, such as Meta. */
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
 * than the host declared. Expanding a coarse answer into fine signals would
 * invent information, and this library never does that.
 *
 * An absent signal produces no key. Treating silence as a denial would put
 * words in the visitor's mouth, just as treating it as a grant would.
 */
export interface ConsentState {
  /** Governs Google's ad cookies. Browser only, since GA4's server-side API has no slot for it. */
  ad_storage?: 'granted' | 'denied';
  /** Governs Google's analytics cookies. Browser only, since GA4's server-side API has no slot. */
  analytics_storage?: 'granted' | 'denied';
  /** Whether user data may be sent for ads. GA4's server-side API reads this one, uppercased. */
  ad_user_data?: 'granted' | 'denied';
  /** Whether ads may be personalised. GA4's server-side API reads this one too, uppercased. */
  ad_personalization?: 'granted' | 'denied';
}

/**
 * Where a conversion happened.
 *
 * Meta's vocabulary, adopted verbatim, because it is the only vendor of the
 * five that documents the concept and requires the field on every server
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
  /** Which vendor produced this. It matches the `name` on the provider that registered it. */
  provider: string;
  /** The canonical event name being sent when this happened. */
  event: string;
  /** `'error'` when the event did not arrive; `'warning'` when it arrived but is worth a look. */
  severity: 'error' | 'warning';
  /** What happened, in one line, excluding the payload: event data never appears here. */
  message: string;
  /** The original thrown value, where one exists, for a host that wants more than `message`. */
  cause?: unknown;
}
