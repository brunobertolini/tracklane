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
 * accepting both would double every event to that vendor, a defect that
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
  onUnmapped?: () => void,
): Target | undefined {
  const events = provider.events;
  // `hasOwn`, not a plain lookup: every object inherits `constructor` and
  // `toString`, so an event named either would otherwise resolve to a
  // function off the prototype chain.
  const binding = events && Object.hasOwn(events, name) ? events[name] : undefined;

  if (binding === null) return undefined;
  if (binding !== undefined) return binding;

  if (provider.default === 'ignore') {
    // Only here. A `null` binding above is the host saying "never send this
    // event here", which is deliberate silence and must stay quiet: warning
    // about a decision somebody made on purpose is how people learn to ignore
    // the warning.
    onUnmapped?.();
    return undefined;
  }

  return name as Target;
}

/**
 * The diagnostic owed to `default: 'ignore'`, promised by ADR-0003 and due
 * with the first provider that uses it.
 *
 * A vendor whose events are minted in its own dashboard cannot be given a name
 * to guess, so an unmapped event sends nothing at all. That is correct and it
 * is invisible, which is the combination this library keeps finding at the
 * bottom of a defect. The report says which vendor, which event, and what to
 * do — the id cannot be guessed, so a message that does not name the dashboard
 * is unactionable.
 *
 * Once per provider and event, because a `view_item` on every page would drown
 * the channel it is trying to be heard on. The set belongs to one tracking
 * instance rather than to the module: a host that rebuilds its tracking, as
 * `@tracklane/consent` does on every consent answer, is asking a fresh
 * question and deserves the answer again.
 */
export function makeUnmappedReporter(
  report: (error: TrackingError) => void,
): (provider: string, event: string) => void {
  const seen = new Set<string>();

  return (provider, event) => {
    // A separator that cannot occur inside either half, written as an
    // escape so this file stays plain ASCII: a literal NUL here makes git
    // treat the source as binary, which costs every future reviewer a diff.
    const key = `${provider}\0${event}`;
    if (seen.has(key)) return;
    seen.add(key);

    report({
      provider,
      event,
      severity: 'warning',
      message: `"${event}" is not mapped for this vendor, which sends nothing rather than guessing a name, so this event went nowhere. Add it to this provider's \`events\`, spelled the way the vendor's own dashboard mints it.`,
    });
  };
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
