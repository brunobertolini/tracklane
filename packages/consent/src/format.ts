import type { ConsentDecision } from './vocabulary.js';

/**
 * The cookie format ADR-0006 fixes as public contract: categories joined by
 * `|`, each `name:decision`, as `analytics:granted|marketing:denied`. No
 * encoding, no JSON, no base64, so it stays readable in devtools and in a
 * raw `Cookie` header.
 *
 * Both `./browser` and `./server` read and write this exact shape. It is
 * defined once, here, and imported by both rather than reimplemented twice,
 * because a format that is public contract must never drift between the two
 * places that speak it.
 */

function isConsentDecision(value: string): value is ConsentDecision {
  return value === 'granted' || value === 'denied';
}

/**
 * Parses a stored value into whatever categories it named.
 *
 * Reading is lenient by design: a malformed pair is skipped, never thrown.
 * The cookie is a value the host's own JavaScript could have altered, and a
 * visitor whose browser holds one bad byte must still get a working site.
 *
 * @param value - The raw cookie value, exactly as stored.
 * @returns Every category the value named with a valid decision. Unknown or
 * malformed pairs are absent, not defaulted, since {@link resolveState} is what
 * applies a default.
 *
 * @example
 * ```ts
 * parseConsentValue('analytics:granted|marketing:denied');
 * // { analytics: 'granted', marketing: 'denied' }
 *
 * parseConsentValue('analytics:maybe|garbage|marketing:granted');
 * // { marketing: 'granted' } the malformed pairs are skipped, not thrown
 * ```
 */
export function parseConsentValue(value: string): Partial<Record<string, ConsentDecision>> {
  const parsed: Partial<Record<string, ConsentDecision>> = {};

  for (const pair of value.split('|')) {
    const separator = pair.indexOf(':');
    if (separator < 1) continue;

    const name = pair.slice(0, separator).trim();
    const decision = pair.slice(separator + 1).trim();
    if (!name || !isConsentDecision(decision)) continue;

    parsed[name] = decision;
  }

  return parsed;
}

/**
 * Serialises a full answer into the cookie format.
 *
 * @param record - Every configured category and what the visitor decided.
 * @returns `name:decision` pairs joined by `|`.
 *
 * @example
 * ```ts
 * serializeConsentValue({ analytics: 'granted', marketing: 'denied' });
 * // 'analytics:granted|marketing:denied'
 * ```
 */
export function serializeConsentValue<C extends string>(
  record: Record<C, ConsentDecision>,
): string {
  return Object.entries(record)
    .map(([name, decision]) => `${name}:${decision as ConsentDecision}`)
    .join('|');
}

/**
 * Total and always two-valued, for every configured category: the stored
 * answer where one exists, that category's default otherwise. A category the
 * cookie names but the host never configured is silently absent, and "an
 * unknown category ignored," exactly as ADR-0006 specifies.
 *
 * @param categories - The host's own category names and their defaults.
 * @param parsed - What {@link parseConsentValue} read, if anything.
 * @returns One decision per configured category, never a third value.
 *
 * @example
 * ```ts
 * resolveState({ analytics: 'granted', marketing: 'granted' }, { marketing: 'denied' });
 * // { analytics: 'granted', marketing: 'denied' }
 * ```
 */
export function resolveState<C extends string>(
  categories: Record<C, ConsentDecision>,
  parsed: Partial<Record<string, ConsentDecision>>,
): Readonly<Record<C, ConsentDecision>> {
  const state = {} as Record<C, ConsentDecision>;

  for (const category of Object.keys(categories) as C[]) {
    state[category] = parsed[category] ?? categories[category];
  }

  return state;
}
