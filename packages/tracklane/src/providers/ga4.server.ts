// Through the public entry point, exactly as a provider written elsewhere
// would import it. A provider that needs something not exported here is
// telling us the contract is incomplete, which is a conversation rather than
// a reason to reach inside.
import type {
  ConsentState,
  EventBinding,
  EventData,
  ResolvedContext,
  ServerProvider,
  UserData,
} from '../index.js';
import { VendorResponseError } from '../index.js';

const ENDPOINT = 'https://www.google-analytics.com/mp/collect';

/** Credentials for the GA4 Measurement Protocol. */
export interface Ga4ServerCredentials {
  /** The `G-` id of the data stream. */
  measurementId: string;
  /** Created under Admin → Data Streams → Measurement Protocol. */
  apiSecret: string;
}

/** Optional configuration for the GA4 server provider. */
export interface Ga4ServerConfig {
  /** How this property spells each canonical event. Rarely needed. */
  events?: Record<string, EventBinding<string>>;
  /**
   * Sends `user_data` built from `user` (email, phone, first and last name),
   * normalised and SHA-256 hashed the way Google documents. Off by default:
   * it starts a new flow of personal data to Google, and the property needs
   * user-provided data collection turned on in GA4's admin.
   *
   * There is no consent check in it. To withhold it, pass `user: { userId }`.
   */
  userProvidedData?: boolean;
}

/**
 * The visitor cookie holds `GA1.<depth>.<client_id>`, and the client id
 * itself contains a dot, so the identifier is the last two segments, which
 * is what survives Google's varying prefix depth.
 *
 * The value must be the cookie as the browser wrote it. A host passing a
 * parsed map passes cookie values, not values it took apart itself.
 */
function visitorId(cookies: Record<string, string>): string | undefined {
  const raw = cookies._ga;
  if (!raw) return undefined;

  const parts = raw.split('.');
  if (parts.length < 4) return undefined;

  return parts.slice(-2).join('.');
}

/**
 * The per-container cookie carries the session, in one of two layouts.
 *
 * Verified against Google's live tag on 2026-07-31 rather than assumed:
 *
 * - `GS2.1.s1785511401$o1$g0$t1785511401$j60$l0$h0`, the current one. The
 *   third dot-segment packs several fields joined by `$`, and the session is
 *   the first of them, prefixed with `s`.
 * - `GS1.1.1785511401.1.1.…`, the older one, where the third dot-segment is
 *   the session on its own.
 *
 * Reading the third segment blindly works for the old layout and returns the
 * whole `s…$o1$g0$…` blob for the new one, which the vendor would accept and
 * silently fail to match. Hence the two shapes, and hence `undefined` rather
 * than a guess when neither fits.
 */
function sessionId(cookies: Record<string, string>, measurementId: string): string | undefined {
  // Scoped to *this* property's cookie. A page with two GA4 properties has two
  // `_ga_*` cookies, and taking whichever came first would attach another
  // property's session to our event, which Google accepts and never matches.
  const value = cookies[`_ga_${measurementId.replace(/^G-/, '')}`];
  const segment = value?.split('.')[2];
  if (!segment) return undefined;

  const packed = /^s(\d+)/.exec(segment);
  if (packed) return packed[1];

  // The older layout: a bare session id, nothing packed around it.
  return /^\d+$/.test(segment) ? segment : undefined;
}

/**
 * The Measurement Protocol documents exactly two consent fields, and spells
 * their values in upper case where the browser spells them in lower, one of
 * the small asymmetries an adapter absorbs so nobody else has to.
 */
function consentBody(state: ConsentState | undefined): Record<string, string> | undefined {
  if (!state) return undefined;

  const body: Record<string, string> = {};
  if (state.ad_user_data) body.ad_user_data = state.ad_user_data.toUpperCase();
  if (state.ad_personalization) body.ad_personalization = state.ad_personalization.toUpperCase();

  return Object.keys(body).length > 0 ? body : undefined;
}

/**
 * The Measurement Protocol's documented limits: "User property names must be
 * 24 characters or fewer", "User property values must be 36 characters or
 * fewer", and at most 25 user properties.
 */
const MAX_PROPERTY_NAME = 24;
const MAX_PROPERTY_VALUE = 36;
const MAX_PROPERTIES = 25;

/**
 * Traits as GA4 user properties. What GA4 cannot hold is left out and
 * reported by name, never replaced: a clear or a truncation would be a value
 * the host did not send. `null` is left out too, because clearing through
 * this protocol is not verified yet (ADR-0014).
 */
function userProperties(
  traits: Record<string, unknown> | undefined,
  traitsAt: number | undefined,
  report: (message: string) => void,
): Record<string, Record<string, unknown>> | undefined {
  if (!traits) return undefined;

  const built: Record<string, Record<string, unknown>> = {};
  const unclearable: string[] = [];
  const tooLong: string[] = [];

  for (const [name, value] of Object.entries(traits)) {
    if (value === null) {
      unclearable.push(name);
    } else if (
      name.length > MAX_PROPERTY_NAME ||
      (typeof value === 'string' && value.length > MAX_PROPERTY_VALUE)
    ) {
      tooLong.push(name);
    } else {
      // Each property is an object with a `value` key here, where the
      // browser takes the bare value. Sending the bare value is rejected
      // by Google's validation endpoint and **accepted with 204 by the
      // collection endpoint**, which then drops it, verified on
      // 2026-07-31. One of several places where this vendor fails by
      // accepting.
      built[name] = {
        value,
        ...(traitsAt === undefined ? {} : { timestamp_micros: traitsAt * 1000 }),
      };
    }
  }

  if (unclearable.length > 0) {
    report(
      `user properties not cleared, because clearing one through the Measurement Protocol is not verified: ${unclearable.join(', ')}`,
    );
  }
  if (tooLong.length > 0) {
    report(
      `user properties left out, over GA4's ${MAX_PROPERTY_NAME}-character name or ${MAX_PROPERTY_VALUE}-character value limit: ${tooLong.join(', ')}`,
    );
  }
  if (Object.keys(built).length > MAX_PROPERTIES) {
    // Not trimmed: which properties matter is the host's choice, not ours.
    report(
      `more than ${MAX_PROPERTIES} user properties, GA4's limit: all were sent, and Google decides which it keeps`,
    );
  }

  return Object.keys(built).length > 0 ? built : undefined;
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));

  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * Google's documented normalisation for user-provided data, which differs
 * from Meta's and LinkedIn's: Gmail addresses lose the dots before `@`, and
 * phones keep a leading `+`.
 */
function normaliseEmail(value: string): string {
  const email = value.replace(/\s/g, '').toLowerCase();
  const [local, domain] = email.split('@');
  if (local === undefined || domain === undefined) return email;

  return domain === 'gmail.com' || domain === 'googlemail.com'
    ? `${local.replace(/\./g, '')}@${domain}`
    : email;
}

function normalisePhone(value: string): string {
  const digits = value.replace(/\D/g, '');
  return digits ? `+${digits}` : '';
}

function normaliseName(value: string): string {
  return value
    .replace(/[^\p{L}\s]/gu, '')
    .toLowerCase()
    .trim();
}

async function userData(user: UserData | undefined): Promise<Record<string, unknown> | undefined> {
  if (!user) return undefined;

  const built: Record<string, unknown> = {};
  const hashed = async (raw: string | undefined, normalise: (value: string) => string) => {
    const normalised = raw === undefined ? '' : normalise(raw);
    // An empty value still hashes to a valid digest that matches nobody.
    return normalised ? sha256(normalised) : undefined;
  };

  const email = await hashed(user.email, normaliseEmail);
  if (email) built.sha256_email_address = [email];

  const phone = await hashed(user.phone, normalisePhone);
  if (phone) built.sha256_phone_number = [phone];

  const firstName = await hashed(user.firstName, normaliseName);
  const lastName = await hashed(user.lastName, normaliseName);
  if (firstName || lastName) {
    built.address = [
      {
        ...(firstName ? { sha256_first_name: firstName } : {}),
        ...(lastName ? { sha256_last_name: lastName } : {}),
      },
    ];
  }

  return Object.keys(built).length > 0 ? built : undefined;
}

/**
 * Google Analytics 4 on the server, through the Measurement Protocol.
 *
 * **`identify` sends user properties with no event**, which Google
 * documents. With no user property to send it sends nothing, because each
 * `track` already carries `user_id`.
 *
 * @param credentials - The measurement id and API secret.
 * @param config - Rarely needed event name overrides, and the opt-in for
 * user-provided data.
 * @returns A provider for `createTracking` from `tracklane/server`.
 *
 * @example
 * ```ts
 * import { createTracking, ga4 } from 'tracklane/server';
 *
 * const { track } = createTracking({
 *   providers: [ga4({ measurementId: 'G-XXXXXXX', apiSecret: process.env.GA4_SECRET! })],
 * });
 *
 * await track('purchase', order, { cookies: request.headers.get('cookie') });
 * ```
 */
export function ga4(
  credentials: Ga4ServerCredentials,
  config: Ga4ServerConfig = {},
): ServerProvider {
  const { measurementId, apiSecret } = credentials;

  const clientIdOf = (context: ResolvedContext): string => {
    const clientId = visitorId(context.cookies);
    if (!clientId) {
      // Not withholding on policy grounds: the protocol requires this and
      // it cannot be invented. The endpoint answers success even to
      // invalid payloads, so sending anyway would look like it worked.
      // Naming the vendor's own field, so that searching Google's docs
      // for the error leads somewhere.
      throw new Error(
        "ga4: cannot build client_id, no _ga cookie among the cookies passed in context. Ensure GA4's browser tag has set it first.",
      );
    }
    return clientId;
  };

  // What every request carries about the person, with or without an event.
  const person = async (
    context: ResolvedContext,
    report: (message: string) => void,
  ): Promise<Record<string, unknown>> => {
    const body: Record<string, unknown> = {
      client_id: clientIdOf(context),
      timestamp_micros: context.timestamp * 1000,
    };

    if (context.user?.userId !== undefined) body.user_id = context.user.userId;

    const properties = userProperties(context.traits, context.traitsAt, report);
    if (properties) body.user_properties = properties;

    if (config.userProvidedData) {
      const data = await userData(context.user);
      if (data) body.user_data = data;
    }

    const consent = consentBody(context.consent);
    if (consent) body.consent = consent;

    return body;
  };

  const send = async (body: Record<string, unknown>, signal?: AbortSignal): Promise<void> => {
    // Credentials go in the query because the protocol offers no
    // alternative. Query strings land in proxy and APM logs; that
    // exposure is Google's design, not a choice made here.
    const url = `${ENDPOINT}?measurement_id=${encodeURIComponent(measurementId)}&api_secret=${encodeURIComponent(apiSecret)}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      ...(signal ? { signal } : {}),
    });

    if (!response.ok) {
      // The message stays free of the payload; the body rides on the
      // error for a host that asks (ADR-0013). A body that will not read
      // must not replace the real failure with a different one.
      const text = await response.text().catch(() => '');
      throw new VendorResponseError(`ga4: the Measurement Protocol answered ${response.status}`, {
        provider: 'ga4',
        status: response.status,
        body: text,
      });
    }
  };

  return {
    name: 'ga4',
    default: 'passthrough',
    ...(config.events ? { events: config.events } : {}),

    async track(
      name: string,
      data: EventData,
      context: ResolvedContext,
      report: (message: string) => void,
    ): Promise<void> {
      const body = await person(context, report);

      const session = sessionId(context.cookies, measurementId);
      if (!session) {
        report(
          'no session cookie (_ga_<container>): Google will accept this event and it will not appear in any report',
        );
      }

      const params: Record<string, unknown> = { ...data };
      if (session) {
        params.session_id = session;
        // Google drops sessions with no engagement from its reports, so the
        // event would arrive and still be invisible without this. A value
        // the host measured itself wins over the placeholder.
        params.engagement_time_msec ??= 1;
      }

      // The dedup id maps nowhere: GA4 documents no browser-to-server
      // deduplication. `transaction_id` (business data) travels in params
      // and is the duplicate control this vendor does have.
      await send({ ...body, events: [{ name, params }] }, context.signal);
    },

    async identify(context: ResolvedContext, report: (message: string) => void): Promise<void> {
      if (context.user?.userId === undefined) throw new Error('ga4: identify needs user.userId');

      const body = await person(context, report);
      // A request with neither events nor user properties is not a case
      // Google documents, and it would teach GA4 nothing: `user_id` already
      // travels on every `track`.
      if (!body.user_properties) return;

      await send(body, context.signal);
    },
  };
}
