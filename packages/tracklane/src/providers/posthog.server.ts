// Through the public entry point, exactly as a provider written elsewhere
// would import it. A provider that needs something not exported here is
// telling us the contract is incomplete, which is a conversation rather than
// a reason to reach inside.
import type { EventBinding, EventData, ResolvedContext, ServerProvider } from '../index.js';
import { VendorResponseError } from '../index.js';

const DEFAULT_HOST = 'https://us.i.posthog.com';

/** Credentials for PostHog's Capture API. */
export interface PosthogServerCredentials {
  /** The project API key, the same one the browser SDK is initialised with (`phc_...`). */
  apiKey: string;
  /**
   * Where this project ingests events, when it is not PostHog's default US
   * Cloud instance — `https://eu.i.posthog.com` for the EU Cloud, or a
   * self-hosted deployment's own origin. Defaults to `https://us.i.posthog.com`.
   */
  host?: string;
}

/** Optional configuration for the PostHog server provider. */
export interface PosthogServerConfig {
  /**
   * How this project spells each canonical event. Rarely needed: `capture()`
   * accepts any string, so the canonical vocabulary already is PostHog's.
   */
  events?: Record<string, EventBinding<string>>;
}

/**
 * The distinct_id lives inside a cookie posthog-js writes by default, named
 * after this project's own api key: `ph_<api_key>_posthog`. Its value is
 * `encodeURIComponent(JSON.stringify({ distinct_id, ... }))`, so it has to be
 * decoded before it parses as JSON.
 *
 * Verified against a live project rather than read off the SDK's source: the
 * cookie was percent-encoded, held `distinct_id` alongside `$device_id` and
 * `$user_state`, and the id parsed out of it matched what the page's own
 * `posthog.get_distinct_id()` returned. A server event sent with it landed on
 * the same person the browser had created, which is the whole point.
 *
 * This is only the anonymous fallback. It is not read when the caller already
 * knows who the visitor is; see the comment in `track` for why.
 */
function anonymousId(cookies: Record<string, string>, apiKey: string): string | undefined {
  const raw = cookies[`ph_${apiKey}_posthog`];
  if (!raw) return undefined;

  try {
    const parsed = JSON.parse(decodeURIComponent(raw)) as { distinct_id?: unknown };
    return typeof parsed.distinct_id === 'string' ? parsed.distinct_id : undefined;
  } catch {
    // A cookie that fails to decode or parse is not this vendor's cookie, or
    // not this shape of it. Either way, nothing to read.
    return undefined;
  }
}

/**
 * PostHog deduplicates on `uuid`, and the field holds a UUID rather than any
 * string: an invalid one is documented as dropped on ingestion, and has been
 * reported answering 400 instead. Since `dedupId` is whatever the host chose
 * — Meta's `event_id` takes anything, and this library's own example is an
 * order id — forwarding it unchecked would turn a duplicated purchase into no
 * purchase at all.
 *
 * Accepts any RFC 4122 layout rather than v4 alone, because v7 is what a
 * system minting ids today tends to produce.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * PostHog on the server, through the Capture API.
 *
 * **Deduplicating a retried webhook takes two things, not one.** `dedupId`
 * becomes PostHog's `uuid`, and PostHog collapses events sharing `uuid`, event
 * name, timestamp and `distinct_id` — so a `timestamp` left to default to the
 * clock differs on the retry and nothing is deduplicated. Pin it to a value
 * derived from the order, as below. The `dedupId` itself must be a UUID:
 * anything else is reported through `onError` and sent without the field,
 * because PostHog rejects other shapes rather than ignoring them.
 *
 * Deduplication is also eventual, happening during a background merge, so both
 * rows are visible for a while and a test that counts immediately will fail.
 *
 * @param credentials - The project API key, and the ingestion host for
 * anything other than PostHog's default US Cloud instance.
 * @param config - Rarely needed event name overrides.
 * @returns A provider for `createTracking` from `tracklane/server`.
 *
 * @example
 * ```ts
 * import { createTracking, posthog } from 'tracklane/server';
 *
 * const { track } = createTracking({
 *   providers: [posthog({ apiKey: process.env.POSTHOG_API_KEY! })],
 * });
 *
 * // Both fields come from the order, so the payment provider's second
 * // delivery of the same webhook produces the same event.
 * await track('purchase', order, {
 *   user: { userId: order.userId },
 *   cookies: request.headers.get('cookie'),
 *   dedupId: order.eventId, // a UUID your checkout minted with the order
 *   timestamp: order.paidAt,
 * });
 * ```
 */
export function posthog(
  credentials: PosthogServerCredentials,
  config: PosthogServerConfig = {},
): ServerProvider {
  const { apiKey, host = DEFAULT_HOST } = credentials;

  return {
    name: 'posthog',
    // capture() accepts any string as an event name, so the canonical
    // vocabulary already is PostHog's, and every event passes through
    // unless the host says otherwise.
    default: 'passthrough',
    ...(config.events ? { events: config.events } : {}),

    async track(
      name: string,
      data: EventData,
      context: ResolvedContext,
      report: (message: string) => void,
    ): Promise<void> {
      // PostHog has one identity slot, distinct_id — not two the way GA4 has
      // a required client_id plus an optional user_id. PostHog's own
      // guidance is to send the same distinct_id the browser SDK is using
      // for that visitor, so a known application user id (the same value
      // handed to `identify()` on the browser) is used first, because it is
      // what the visitor becomes once they are known. The anonymous id
      // PostHog's own tag already wrote to its cookie is the fallback for a
      // visitor nobody has identified yet. Inventing a third value here
      // would orphan the event: PostHog would accept it and never connect it
      // to anything, on either side.
      const id = context.user?.userId ?? anonymousId(context.cookies, apiKey);
      if (!id) {
        throw new Error(
          "posthog: cannot resolve distinct_id — no user.userId in context and no ph_<api_key>_posthog cookie among the cookies passed in context. Pass user.userId once the visitor is known, or ensure PostHog's browser tag has set its cookie first.",
        );
      }

      const properties: Record<string, unknown> = { ...data };
      // $set is the server-side slot for what is known *about* the person,
      // the same job `user_properties` does in GA4's Measurement Protocol
      // body — kept separate from the identifiers used to match someone.
      if (context.traits) properties.$set = context.traits;

      // The deduplication key is `uuid`, and it is the whole quartet of
      // `uuid`, event name, timestamp and distinct_id that PostHog collapses,
      // eventually, during a background merge. So this field alone does not
      // make a retry idempotent: the host has to pin `context.timestamp` to
      // something derived from the order rather than let it default to the
      // clock. That is documentation's job, not this adapter's.
      const dedup: { uuid?: string } = {};
      if (context.dedupId !== undefined) {
        if (UUID.test(context.dedupId)) {
          dedup.uuid = context.dedupId;
        } else {
          // Sent anyway, without the field. The alternative is the vendor
          // dropping the whole event over an id shape, which trades a visible
          // duplicate for an invisible absence.
          report(
            'dedupId is not a UUID, so it was not forwarded as uuid: PostHog deduplicates on that field and rejects other shapes, so this event can duplicate on a retry',
          );
        }
      }

      const body = {
        api_key: apiKey,
        event: name,
        distinct_id: id,
        ...dedup,
        // context.url, context.ip and context.userAgent are not forwarded
        // either. PostHog documents override properties for some of these
        // on other surfaces, but nothing found here confirms one for this
        // endpoint with enough certainty to translate rather than guess, so
        // they are left unmapped. context.consent and context.source are
        // Google's and Meta's vocabularies respectively, and this endpoint
        // documents a slot for neither.
        properties,
        timestamp: new Date(context.timestamp).toISOString(),
      };

      const response = await fetch(`${host}/i/v0/e/`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        // The message stays free of the payload; the body rides on the
        // error for a host that asks (ADR-0013). A body that will not read
        // must not replace the real failure with a different one.
        const body = await response.text().catch(() => '');
        throw new VendorResponseError(`posthog: the capture endpoint answered ${response.status}`, {
          provider: 'posthog',
          status: response.status,
          body,
        });
      }
    },
  };
}
