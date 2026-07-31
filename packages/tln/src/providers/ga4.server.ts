import type { ResolvedContext, ServerProvider } from '../server.js';
import type { ConsentState, EventBinding, EventData } from '../vocabulary.js';

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
  events?: Record<string, EventBinding<string>>;
}

/**
 * The visitor cookie holds `GA1.<depth>.<client_id>`, and the client id
 * itself contains a dot — so the identifier is the last two segments, which
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
 * - `GS2.1.s1785511401$o1$g0$t1785511401$j60$l0$h0` — the current one. The
 *   third dot-segment packs several fields joined by `$`, and the session is
 *   the first of them, prefixed with `s`.
 * - `GS1.1.1785511401.1.1.…` — the older one, where the third dot-segment is
 *   the session on its own.
 *
 * Reading the third segment blindly works for the old layout and returns the
 * whole `s…$o1$g0$…` blob for the new one — which the vendor would accept and
 * silently fail to match. Hence the two shapes, and hence `undefined` rather
 * than a guess when neither fits.
 */
function sessionId(cookies: Record<string, string>, measurementId: string): string | undefined {
  // Scoped to *this* property's cookie. A page with two GA4 properties has two
  // `_ga_*` cookies, and taking whichever came first would attach another
  // property's session to our event — which Google accepts and never matches.
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
 * their values in upper case where the browser spells them in lower — one of
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
 * Google Analytics 4 on the server, through the Measurement Protocol.
 *
 * @param credentials - The measurement id and API secret.
 * @param config - Rarely needed event name overrides.
 * @returns A provider for `createTracking` from `@brunobertolini/tln/server`.
 *
 * @example
 * ```ts
 * import { createTracking, ga4 } from '@brunobertolini/tln/server';
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
      const clientId = visitorId(context.cookies);
      if (!clientId) {
        // Not withholding on policy grounds: the protocol requires this and
        // it cannot be invented. The endpoint answers success even to
        // invalid payloads, so sending anyway would look like it worked.
        // Naming the vendor's own field, so that searching Google's docs
        // for the error leads somewhere.
        throw new Error(
          'ga4: cannot build client_id — no _ga cookie among the cookies passed in context',
        );
      }

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
        // event would arrive and still be invisible without this.
        params.engagement_time_msec = 1;
      }

      // The dedup id maps nowhere: GA4 documents no browser-to-server
      // deduplication. `transaction_id` — business data — travels in params
      // and is the duplicate control this vendor does have.
      const body: Record<string, unknown> = {
        client_id: clientId,
        timestamp_micros: context.timestamp * 1000,
        events: [{ name, params }],
      };

      if (context.user?.userId !== undefined) body.user_id = context.user.userId;

      if (context.traits) {
        // Each property is an object with a `value` key here, where the
        // browser takes the bare value. Sending the bare value is rejected
        // by Google's validation endpoint and **accepted with 204 by the
        // collection endpoint**, which then drops it — verified on
        // 2026-07-31. One of several places where this vendor fails by
        // accepting.
        body.user_properties = Object.fromEntries(
          Object.entries(context.traits).map(([name, value]) => [name, { value }]),
        );
      }

      const consent = consentBody(context.consent);
      if (consent) body.consent = consent;

      // Credentials go in the query because the protocol offers no
      // alternative. Query strings land in proxy and APM logs; that
      // exposure is Google's design, not a choice made here.
      const url = `${ENDPOINT}?measurement_id=${encodeURIComponent(measurementId)}&api_secret=${encodeURIComponent(apiSecret)}`;

      const response = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        // The status only. The event carries raw personal data, and no
        // library-owned surface re-emits it into a host's logs.
        throw new Error(`ga4: the Measurement Protocol answered ${response.status}`);
      }
    },
  };
}
