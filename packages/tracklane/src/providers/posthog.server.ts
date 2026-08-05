// Through the public entry point, exactly as a provider written elsewhere
// would import it. A provider that needs something not exported here is
// telling us the contract is incomplete, which is a conversation rather than
// a reason to reach inside.
import type { EventBinding, EventData, ResolvedContext, ServerProvider } from '../index.js';

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
 * PostHog on the server, through the Capture API.
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
 * await track('purchase', order, {
 *   user: { userId: order.userId },
 *   cookies: request.headers.get('cookie'),
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
      _report: (message: string) => void,
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

      const body = {
        api_key: apiKey,
        event: name,
        distinct_id: id,
        // The Capture API documents no deduplication key at all — not even
        // one under a vendor-specific name, the way Meta, LinkedIn and X
        // each have. `dedupId` maps to nothing here for the same reason it
        // maps to nothing for GA4: there is no field to put it in.
        //
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
        // The status only. The event carries raw personal data, and no
        // library-owned surface re-emits it into a host's logs.
        throw new Error(`posthog: the capture endpoint answered ${response.status}`);
      }
    },
  };
}
