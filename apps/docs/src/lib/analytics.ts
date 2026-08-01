/**
 * The GA4 data stream this site reports to.
 *
 * Absent locally and in forks, where the site runs with the same tracking
 * surface and no destinations at all, rather than with a different code path.
 */
export const ga4MeasurementId: string = process.env.NEXT_PUBLIC_GA4_ID ?? '';
