import type { ConsentDecision } from './vocabulary.js';

/**
 * One entry in a provider list passed to {@link selectProviders}.
 *
 * A bare entry is unconditional. A wrapped one is present only while every
 * category in `needs` is granted. `needs` accepts a single category or
 * several, and several means all of them, not any.
 */
export type GatedProvider<C extends string, P> = P | { provider: P; needs: C | readonly C[] };

function isGated<C extends string, P>(
  entry: GatedProvider<C, P>,
): entry is { provider: P; needs: C | readonly C[] } {
  return typeof entry === 'object' && entry !== null && 'needs' in entry;
}

/**
 * Filters a provider list down to what the current answer allows.
 *
 * A pure function of state and list, with nothing held between calls: the
 * shape a live, kept-in-sync array would have cost is documented in
 * ADR-0006 and is exactly what this avoids. Call it again whenever the
 * answer changes; `./tracklane`'s `consentedTracking` is what does that on
 * the browser's common path.
 *
 * @param state - The current answer for every category this list's `needs`
 * might name.
 * @param providers - Bare entries, always included, and wrapped entries,
 * included only while their `needs` are granted.
 * @returns The providers to configure right now, in the order they were
 * given.
 *
 * @example
 * ```ts
 * import { selectProviders } from '@tracklane/consent/server';
 * import { createTracking, ga4, meta } from 'tracklane/server';
 *
 * const { track } = createTracking({
 *   providers: selectProviders(state, [
 *     ga4({ measurementId, apiSecret }),
 *     { provider: meta({ pixelId, accessToken }), needs: 'marketing' },
 *   ]),
 * });
 * ```
 */
export function selectProviders<C extends string, P>(
  state: Readonly<Record<C, ConsentDecision>>,
  providers: readonly GatedProvider<C, P>[],
): P[] {
  const selected: P[] = [];

  for (const entry of providers) {
    if (!isGated(entry)) {
      selected.push(entry as P);
      continue;
    }

    // Not `Array.isArray(entry.needs)`: TS's `Array.isArray` guard is typed
    // `x is any[]`, which collapses a generic element type to `any` on both
    // narrowed branches. `C extends string`, so a plain `typeof` check
    // narrows correctly and keeps `category` below typed as `C`.
    const needs: readonly C[] = typeof entry.needs === 'string' ? [entry.needs] : entry.needs;
    if (needs.every((category) => state[category] === 'granted')) selected.push(entry.provider);
  }

  return selected;
}
