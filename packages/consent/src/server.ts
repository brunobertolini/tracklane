import { parseConsentValue, resolveState } from './format.js';
import type { ConsentDecision } from './vocabulary.js';

export { type GatedProvider, selectProviders } from './select.js';

const DEFAULT_COOKIE_NAME = 'tl_consent';

/**
 * `name=value; name=value`, the shape of a `Cookie` header.
 *
 * Splits, never interprets: values are handed back exactly as they appear,
 * with no percent-decoding, mirroring how `tracklane/server`'s own
 * `EventContext.cookies` is parsed.
 */
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
    if (name) parsed[name] = pair.slice(separator + 1).trim();
  }

  return parsed;
}

/** Options accepted by {@link readConsent}. */
export interface ReadConsentOptions<C extends string> {
  /** The host's own category names, and what each is before the visitor answers. */
  categories: Record<C, ConsentDecision>;
  /** Defaults to `'tl_consent'`, matching {@link cookieStorage}'s default. */
  name?: string;
}

/** What {@link readConsent} returns. */
export interface ReadConsentResult<C extends string> {
  /** Total and always two-valued. Defaults where the cookie named nothing, the answer otherwise. */
  state: Readonly<Record<C, ConsentDecision>>;
  /** Whether the cookie was present at all, regardless of what it parsed to. */
  answered: boolean;
}

/**
 * Reads the visitor's consent answer from a request's cookies.
 *
 * A pure function of the request, with no store, no instance and nothing
 * between calls: the same shape `tracklane/server`'s own `createTracking`
 * takes, and for the same reason: a server instance is shared by every
 * request, so anything held here would apply one visitor's answer to
 * another visitor's conversion.
 *
 * @param cookies - The request's raw `Cookie` header, or an already-parsed
 * map. Mirrors `EventContext.cookies` in `tracklane/server` exactly, so a
 * handler passes the same value to both without ceremony.
 * @param options - The host's categories and defaults, and the cookie name.
 * @returns The resolved `state` and whether the visitor has answered.
 *
 * @example
 * ```ts
 * import { readConsent } from '@tracklane/consent/server';
 *
 * const { state } = readConsent(request.headers.get('cookie'), {
 *   categories: { analytics: 'granted', marketing: 'granted' },
 * });
 * ```
 */
export function readConsent<C extends string>(
  cookies: string | Record<string, string> | null | undefined,
  options: ReadConsentOptions<C>,
): ReadConsentResult<C> {
  const name = options.name ?? DEFAULT_COOKIE_NAME;
  const raw = parseCookies(cookies)[name];

  return {
    state: resolveState(options.categories, raw !== undefined ? parseConsentValue(raw) : {}),
    answered: raw !== undefined,
  };
}
