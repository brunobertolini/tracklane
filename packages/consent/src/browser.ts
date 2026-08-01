import { parseConsentValue, resolveState, serializeConsentValue } from './format.js';
import type { ConsentDecision } from './vocabulary.js';

export { type GatedProvider, selectProviders } from './select.js';

const DEFAULT_COOKIE_NAME = 'tl_consent';
const ONE_YEAR_IN_SECONDS = 60 * 60 * 24 * 365;

/** Where the visitor's answer is read from and written to. */
export interface ConsentStorage {
  /** The raw stored value, or `null` where nothing has been stored yet. */
  read(): string | null;
  /** Persists a value in the format {@link serializeConsentValue} produces. */
  write(value: string): void;
  /**
   * Erases the record. `answered` returns to `false` and nothing else is
   * touched: this is for a visitor who asks to be forgotten, not for a
   * policy change (a new cookie name) or a preference screen (`answer` with
   * a new record).
   */
  forget(): void;
}

/** Options accepted by {@link cookieStorage}. */
export interface CookieStorageOptions {
  /** Defaults to `'tl_consent'`. */
  name?: string;
  /** Omitted by default, which scopes the cookie to the current host. */
  domain?: string;
  /** In seconds. Defaults to one year. */
  maxAge?: number;
}

/**
 * The default storage: a first-party cookie, readable by both this library
 * and a server request.
 *
 * `forget` earns its place here rather than on the {@link Consent} it backs:
 * erasing a cookie by hand means repeating its name and domain exactly, and
 * getting either wrong erases nothing and reports no error. This closure
 * already holds both.
 *
 * @param options - The cookie's name, domain and lifetime. All optional.
 * @returns A {@link ConsentStorage} backed by `document.cookie`.
 *
 * @example
 * ```ts
 * import { cookieStorage, createConsent } from '@tracklane/consent/browser';
 *
 * const consent = createConsent({
 *   categories: { analytics: 'granted', marketing: 'granted' },
 *   storage: cookieStorage({ domain: '.example.com' }),
 * });
 * ```
 */
export function cookieStorage(options: CookieStorageOptions = {}): ConsentStorage {
  const name = options.name ?? DEFAULT_COOKIE_NAME;
  const maxAge = options.maxAge ?? ONE_YEAR_IN_SECONDS;
  // Site-wide on purpose: a cookie scoped to the page's own path would be
  // invisible to a server request for any other route.
  const attributes = `path=/${options.domain ? `; domain=${options.domain}` : ''}`;
  const pattern = new RegExp(`(?:^|; )${name}=([^;]*)`);

  // Server rendering reaches this module with no document at all, where
  // `document` is a ReferenceError rather than `undefined`. A store built
  // during a prerender therefore reads "not answered" and writes nowhere,
  // and the browser pass that follows sees the real cookie. Without this
  // every framework that prerenders would need its own inert stand-in.
  const hasDocument = (): boolean => typeof document !== 'undefined';

  return {
    read() {
      if (!hasDocument()) return null;

      return pattern.exec(document.cookie)?.[1] ?? null;
    },
    write(value) {
      if (!hasDocument()) return;

      // No `encodeURIComponent`: the format is `name:decision|name:decision`,
      // none of which needs escaping, and ADR-0006 requires the cookie stay
      // readable verbatim in devtools and in a raw `Cookie` header. The
      // Cookie Store API this rule suggests instead is not available in
      // every browser tracklane targets.
      // biome-ignore lint/suspicious/noDocumentCookie: see above.
      document.cookie = `${name}=${value}; max-age=${maxAge}; ${attributes}`;
    },
    forget() {
      if (!hasDocument()) return;

      // biome-ignore lint/suspicious/noDocumentCookie: see write() above.
      document.cookie = `${name}=; max-age=0; ${attributes}`;
    },
  };
}

/** Options accepted by {@link createConsent}. */
export interface CreateConsentOptions<C extends string> {
  /** The host's own category names, and what each is before the visitor answers. */
  categories: Record<C, ConsentDecision>;
  /** Defaults to {@link cookieStorage}. */
  storage?: ConsentStorage;
}

/** The visitor's answer, and the means to change it. */
export interface Consent<C extends string> {
  /** Total and always two-valued. Defaults before an answer, the answer after. */
  readonly state: Readonly<Record<C, ConsentDecision>>;
  /** Whether a stored answer exists. Derived from storage, never held separately. */
  readonly answered: boolean;
  /**
   * Records the visitor's decision for every configured category.
   *
   * Takes the whole record, never a partial one: a stored partial answer
   * would let a later change to the defaults silently rewrite what the
   * visitor actually decided.
   */
  answer(record: Record<C, ConsentDecision>): void;
  /** Notified after `answer`, with the new `state`. Returns a function that unsubscribes. */
  subscribe(listener: (state: Readonly<Record<C, ConsentDecision>>) => void): () => void;
}

/**
 * Holds the visitor's consent answer.
 *
 * `state` keeps a stable reference between changes, so
 * `useSyncExternalStore(consent.subscribe, () => consent.state)` works with
 * no adapter and this stays out of the React business.
 *
 * @param config - The host's categories and defaults, and where to store the
 * answer.
 * @returns The current `state`, whether the visitor has `answer`ed, and the
 * means to change it.
 *
 * @example
 * ```ts
 * import { createConsent } from '@tracklane/consent/browser';
 *
 * const consent = createConsent({
 *   categories: { analytics: 'granted', marketing: 'granted' },
 * });
 *
 * if (!consent.answered) {
 *   accept.onclick = () => consent.answer({ analytics: 'granted', marketing: 'granted' });
 *   refuse.onclick = () => consent.answer({ analytics: 'granted', marketing: 'denied' });
 * }
 * ```
 */
export function createConsent<C extends string>(config: CreateConsentOptions<C>): Consent<C> {
  const { categories } = config;
  const storage = config.storage ?? cookieStorage();

  const stored = storage.read();
  let state = resolveState(categories, stored !== null ? parseConsentValue(stored) : {});
  let answered = stored !== null;

  const listeners = new Set<(state: Readonly<Record<C, ConsentDecision>>) => void>();

  return {
    get state() {
      return state;
    },
    get answered() {
      return answered;
    },
    answer(record) {
      storage.write(serializeConsentValue(record));
      state = resolveState(categories, record);
      answered = true;
      for (const listener of listeners) listener(state);
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
