/**
 * The GA4 data stream this site reports to.
 *
 * Absent locally and in forks, where the site runs with the same tracking
 * surface and no destinations at all, rather than with a different code path.
 */
export const ga4MeasurementId: string = process.env.NEXT_PUBLIC_GA4_ID ?? '';

/**
 * The region `consentedTracking` surveys its rules for.
 *
 * ADR-0005 forbids geolocation inside the consent packages, and a static
 * export has no request to read a header from even where that were allowed.
 * `'ZZ'` is ISO 3166-1's own user-assigned code for "unknown", chosen over
 * guessing a real country: it resolves to the strictest surveyed
 * configuration (opt-in, both purposes offered, both denied until answered),
 * which is what a visitor of unknown jurisdiction is owed, and it is also
 * what this site already did before it could ask anyone anything.
 */
export const consentRegion = 'ZZ';
