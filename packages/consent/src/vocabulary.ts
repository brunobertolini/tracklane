/**
 * The one type the browser and server halves of this package share, the same
 * way `tracklane`'s own two libraries share only a vocabulary and nothing
 * else (ADR-0006).
 */

/** Whether the visitor granted or denied a category. The whole vocabulary: two values, always. */
export type ConsentDecision = 'granted' | 'denied';
