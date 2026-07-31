import type { EventBinding, ProviderDefault, TrackingError } from './vocabulary.js';

/** The part of a provider both libraries resolve event names against. */
interface Resolvable<Target> {
  name: string;
  default: ProviderDefault;
  events?: Record<string, EventBinding<Target>>;
}

/**
 * Registering one vendor twice is a hard error rather than a merge: there is
 * nothing a second registration could say that the first cannot, and
 * accepting both would double every event to that vendor — a defect that
 * surfaces weeks later as inflated conversions.
 */
export function assertUniqueProviders(providers: readonly { name: string }[]): void {
  const seen = new Set<string>();

  for (const provider of providers) {
    if (seen.has(provider.name)) {
      throw new Error(
        `tracklane: provider "${provider.name}" is registered twice. One configuration per vendor.`,
      );
    }
    seen.add(provider.name);
  }
}

/**
 * Resolves how a vendor spells a canonical event, or `undefined` when
 * nothing should be sent.
 *
 * Not sending is a legitimate outcome rather than a failure: `null` is the
 * host saying "never send this event here", and `ignore` is a vendor whose
 * event identity is minted per account in its own dashboard, so there is no
 * name that could possibly be guessed.
 */
export function resolveEvent<Target>(
  provider: Resolvable<Target>,
  name: string,
): Target | undefined {
  const events = provider.events;
  // `hasOwn`, not a plain lookup: every object inherits `constructor` and
  // `toString`, so an event named either would otherwise resolve to a
  // function off the prototype chain.
  const binding = events && Object.hasOwn(events, name) ? events[name] : undefined;

  if (binding === null) return undefined;
  if (binding !== undefined) return binding;
  if (provider.default === 'ignore') return undefined;

  return name as Target;
}

/**
 * Builds the reporting channel. A host that passes no `onError` gets
 * silence, which is what a hand-written vendor call gives it.
 */
export function makeReporter(
  onError: ((error: TrackingError) => void) | undefined,
): (error: TrackingError) => void {
  if (!onError) return () => {};

  return (error) => {
    // A throwing reporter must not take the dispatch down with it, or a
    // host's broken logger becomes a broken checkout.
    try {
      onError(error);
    } catch {
      /* the reporter is the last line; there is nowhere left to report to */
    }
  };
}

/** Normalises whatever a provider threw into a reportable message. */
export function messageOf(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}
