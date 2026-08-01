/**
 * The GA4 data stream this site reports to.
 *
 * Absent locally and in forks, where the site runs with the same tracking
 * surface and no destinations at all, rather than with a different code path.
 */
export const ga4MeasurementId: string = process.env.NEXT_PUBLIC_GA4_ID ?? '';

/**
 * The region whose surveyed rules decide this site's consent defaults.
 *
 * Region detection is the host's and this one is a static export with no
 * request to read a country header from. `'ZZ'` is ISO 3166-1's own
 * user-assigned code for "unknown", chosen over guessing a real country: it
 * resolves to the strictest surveyed configuration, which is what a visitor
 * of unknown jurisdiction is owed and what this site already did before it
 * could ask anyone anything.
 */
export const consentRegion = 'ZZ';
