/**
 * A dated, sourced survey of what a jurisdiction requires before measurement
 * may begin.
 *
 * This is data, never a decision. `rulesFor` returns a configuration; nothing
 * exported here names a vendor, calls a provider, or answers "may this be
 * sent". A jurisdiction map that knew about providers would be a compliance
 * layer wearing a different hat, which is exactly what this package refuses
 * to become (ADR-0005, ADR-0006).
 *
 * The rules are a survey, not legal advice, and they are dated because they
 * change: {@link surveyedAt} says when, and every {@link ConsentRules} carries
 * a `source` pointing at the law or regulator guidance it was read from.
 *
 * @packageDocumentation
 */

/** Whether the visitor granted or denied a purpose. The whole vocabulary: two values, always. */
export type ConsentDecision = 'granted' | 'denied';

/**
 * The fixed vocabulary this package speaks.
 *
 * A jurisdiction survey cannot speak a vocabulary it has never seen, so these
 * two purposes are all `rulesFor` ever names. The host's own category names
 * are a different, host-owned concept, mapped onto these at the point of use.
 */
export type ConsentPurpose = 'analytics' | 'marketing';

/**
 * What one jurisdiction requires before measurement may begin, and what the
 * visitor must be offered a choice about.
 *
 * `offer` and `defaults` are separate fields on purpose: in Brazil, analytics
 * defaults to granted *and* owes the visitor no choice, while marketing
 * defaults to granted *and* owes one. A single field cannot carry both facts.
 */
export interface ConsentRules {
  /** Whether measurement may begin before the question is answered. */
  mode: 'opt-in' | 'opt-out';
  /** Which purposes the visitor must be offered a choice about. */
  offer: readonly ConsentPurpose[];
  /** What each purpose is before, or absent, an answer. */
  defaults: Readonly<Record<ConsentPurpose, ConsentDecision>>;
  /**
   * The law or regulator guidance this was surveyed from. Rules without one
   * do not ship: an undated, unsourced assertion about what the law requires
   * is an opinion presented as a fact.
   */
  source: string;
}

/**
 * `YYYY-MM`, the month this survey was last reviewed.
 *
 * These rules change, and an undated map of what the law requires reads as a
 * fact rather than the survey it is.
 *
 * @example
 * ```ts
 * import { surveyedAt } from '@tracklane/consent-rules';
 *
 * console.log(`Consent rules current as of ${surveyedAt}`);
 * ```
 */
export const surveyedAt: string = '2026-08';

/**
 * The strictest configuration surveyed, used for any region not named below.
 *
 * Opt-in, both purposes offered, both denied by default: the safe assumption
 * for a jurisdiction nobody has reviewed yet, in the spirit of the EU's
 * General Data Protection Regulation, the strictest regime this survey
 * covers.
 */
const FALLBACK: ConsentRules = {
  mode: 'opt-in',
  offer: ['analytics', 'marketing'],
  defaults: { analytics: 'denied', marketing: 'denied' },
  source:
    'No jurisdiction-specific survey exists for this region. Falls back to the strictest regime ' +
    'surveyed here, modelled on the EU General Data Protection Regulation ' +
    '(Regulation (EU) 2016/679), https://eur-lex.europa.eu/eli/reg/2016/679/oj',
};

/**
 * Rules as surveyed in {@link surveyedAt}, one per region.
 *
 * Keys are ISO 3166-1 alpha-2, optionally with a subdivision (`'US-CA'`).
 * This is a survey of five providers' most common markets, not a claim of
 * global coverage: everything else falls back to {@link FALLBACK}.
 */
const RULES: Readonly<Record<string, ConsentRules>> = {
  // Lei nº 13.709/2018 (LGPD), arts. 7º and 8º: analytics runs on the
  // legitimate-interest basis and owes no choice; advertising needs one.
  // Both default to granted under Brazil's opt-out model.
  BR: {
    mode: 'opt-out',
    offer: ['marketing'],
    defaults: { analytics: 'granted', marketing: 'granted' },
    source:
      'Lei nº 13.709/2018 (Lei Geral de Proteção de Dados), arts. 7º e 8º, ' +
      'https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709.htm',
  },
  // TDDDG §25, Germany's implementation of the ePrivacy Directive: storing or
  // reading anything non-essential on a device needs opt-in consent, analytics
  // included. The act was the TTDSG until it was renamed in 2024; §25 carried
  // over unchanged, and older writing about "TTDSG §25" is about this.
  DE: {
    mode: 'opt-in',
    offer: ['analytics', 'marketing'],
    defaults: { analytics: 'denied', marketing: 'denied' },
    source:
      'Telekommunikation-Digitale-Dienste-Datenschutz-Gesetz (TDDDG), §25, ' +
      'https://www.gesetze-im-internet.de/tdddg/',
  },
  // California Consumer Privacy Act, as amended by the California Privacy
  // Rights Act (CCPA/CPRA): an opt-out regime built around the right to
  // refuse the "sale" or "sharing" of personal information, which is where
  // advertising falls. Analytics is not a sale on its own and needs no
  // opt-out lever.
  'US-CA': {
    mode: 'opt-out',
    offer: ['marketing'],
    defaults: { analytics: 'granted', marketing: 'granted' },
    source: 'California Consumer Privacy Act (CCPA/CPRA), https://oag.ca.gov/privacy/ccpa',
  },
};

/**
 * Looks up what a region requires before measurement may begin.
 *
 * An unrecognised region is not an error: it returns the strictest surveyed
 * configuration, whose `source` says so. Region detection itself is the
 * host's (ADR-0005): this function only takes a code and never guesses one.
 *
 * @param region - ISO 3166-1 alpha-2, optionally with a subdivision
 * (`'US-CA'`). Matched case-insensitively.
 * @returns The rules surveyed for that region, or the strict fallback.
 *
 * @example
 * ```ts
 * import { rulesFor } from '@tracklane/consent-rules';
 *
 * rulesFor('BR'); // { mode: 'opt-out', offer: ['marketing'], ... }
 * rulesFor('DE'); // { mode: 'opt-in', offer: ['analytics', 'marketing'], ... }
 * rulesFor('JP'); // the strict fallback, nobody has surveyed Japan yet
 * ```
 */
export function rulesFor(region: string): ConsentRules {
  return RULES[region.toUpperCase()] ?? FALLBACK;
}
