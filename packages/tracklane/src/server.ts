import { assertUniqueProviders, makeReporter, messageOf, resolveEvent } from './dispatch.js';

export {
  type Ga4ServerConfig,
  type Ga4ServerCredentials,
  ga4,
} from './providers/ga4.server.js';

import type {
  ActionSource,
  ConsentState,
  EventBinding,
  EventData,
  ProviderDefault,
  TrackingError,
  UserData,
} from './vocabulary.js';

/**
 * Everything a conversion API needs beyond the event itself: who the person
 * is, when it happened, and where it was observed.
 *
 * None of this is "what happened", which is why it does not travel in the
 * event data — putting it there would leak identity into the pass-through
 * event params of the vendors that forward the payload as-is.
 */
export interface EventContext {
  user?: UserData;
  /**
   * The request's raw `Cookie` header, or an already-parsed map.
   *
   * These are cookies the vendors' own browser tags set — this library never
   * writes one. On the server each adapter reads the cookies belonging to
   * its own vendor: Meta forwards its value as-is, Google's holds several
   * things at once and has to be opened. That knowledge lives in the
   * adapters; the core only splits `name=value; name=value` into pairs.
   *
   * **It splits, it does not interpret.** Values are handed over exactly as
   * they appear, with no percent-decoding. The cookies these vendors set do
   * not need it; a host reading some other cookie should decode it itself.
   */
  cookies?: string | Record<string, string> | null;
  /** Ties this send to a browser hit. Never invented by the library. */
  dedupId?: string;
  /**
   * When the conversion actually happened. Defaults to now.
   *
   * A webhook arrives after the fact and LinkedIn rejects conversions older
   * than 90 days, so reporting "now" for everything would quietly distort
   * attribution.
   */
  timestamp?: number | Date;
  /** Overrides the factory default. Meta requires it on every event. */
  source?: ActionSource;
  url?: string;
  ip?: string;
  userAgent?: string;
  /** What is known *about* the person: GA4 user properties, PostHog `$set`. */
  traits?: Record<string, unknown>;
  /**
   * Travels inside the event, for the vendors that document such a field.
   * Today that is GA4's Measurement Protocol, and it reads two of the
   * signals; the others have no slot and ignore it.
   */
  consent?: ConsentState;
}

/** The context an adapter receives, with the ambiguity resolved. */
export interface ResolvedContext extends Omit<EventContext, 'cookies' | 'timestamp'> {
  cookies: Record<string, string>;
  /** Epoch milliseconds. Adapters convert to their vendor's spelling. */
  timestamp: number;
}

/**
 * A destination for server events.
 *
 * `track` may throw — on a non-2xx, or where a vendor documents a
 * precondition the event cannot meet. The dispatcher isolates and reports
 * it, so adapters stay honest and loud.
 *
 * `report` is for a caveat about a request that already succeeded. It is
 * never a throw: by then the send happened, and throwing would tell a host's
 * retry logic to resend a delivered conversion.
 */
export interface ServerProvider<Target = string> {
  name: string;
  default: ProviderDefault;
  events?: Record<string, EventBinding<Target>>;
  track(
    name: Target,
    data: EventData,
    context: ResolvedContext,
    report: (message: string) => void,
  ): Promise<void>;
}

/** Options accepted by {@link createTracking}. */
export interface ServerTrackingOptions {
  providers: readonly ServerProvider[];
  onError?: (error: TrackingError) => void;
}

/** What {@link createTracking} returns. */
export interface ServerTracking {
  /**
   * Sends one event to every configured conversion API.
   *
   * Resolves once every provider has settled and never rejects: one vendor
   * being down is not the caller's failure to handle. Awaiting is about the
   * request surviving a serverless runtime, not about delivery being
   * guaranteed.
   */
  track(name: string, data?: EventData, context?: EventContext): Promise<void>;
}

/** `name=value; name=value` — the shape of a `Cookie` header. */
function parseCookies(
  cookies: string | Record<string, string> | null | undefined,
): Record<string, string> {
  if (!cookies) return {};
  if (typeof cookies !== 'string') return cookies;

  const parsed: Record<string, string> = {};

  for (const pair of cookies.split(';')) {
    const separator = pair.indexOf('=');
    if (separator < 1) continue;

    const name = pair.slice(0, separator).trim();
    // Cookie values may contain `=`, so only the first one separates.
    if (name) parsed[name] = pair.slice(separator + 1).trim();
  }

  return parsed;
}

/**
 * Creates the server tracking surface.
 *
 * There is no `identify` here and nothing is held between calls: a server
 * instance is shared by every request, so a retained identity would attach
 * one visitor to another visitor's conversion. Identity travels with the
 * call, which is also what every conversion API expects.
 *
 * There is no `consent` call either — consent commands are properties of a
 * vendor's on-page tag, and a server request has no tag. The one vendor that
 * accepts consent server-side reads it from the context.
 *
 * @param options - The providers to send to, and an optional error channel.
 * @returns The `track` call.
 *
 * @example
 * ```ts
 * import { createTracking, ga4 } from 'tracklane/server';
 *
 * const { track } = createTracking({
 *   providers: [ga4({ measurementId: 'G-XXXXXXX', apiSecret })],
 * });
 *
 * await track('purchase', order, { cookies: request.headers.get('cookie') });
 * ```
 */
export function createTracking(options: ServerTrackingOptions): ServerTracking {
  const { providers } = options;
  assertUniqueProviders(providers);

  const report = makeReporter(options.onError);

  return {
    async track(name, data = {}, context = {}) {
      const { cookies, timestamp, ...rest } = context;
      const resolved: ResolvedContext = {
        ...rest,
        cookies: parseCookies(cookies),
        timestamp: timestamp instanceof Date ? timestamp.getTime() : (timestamp ?? Date.now()),
      };

      const sends = providers.map(async (provider) => {
        const target = resolveEvent(provider, name);
        if (target === undefined) return;

        try {
          await provider.track(target, data, resolved, (message) => {
            report({ provider: provider.name, event: name, severity: 'warning', message });
          });
        } catch (cause) {
          report({
            provider: provider.name,
            event: name,
            severity: 'error',
            message: messageOf(cause),
            cause,
          });
        }
      });

      await Promise.all(sends);
    },
  };
}
