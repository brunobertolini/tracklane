import type { BrowserProvider, EventBinding, EventData, TrackOptions } from '../index.js';

/** Configuration for the LinkedIn Insight Tag provider. */
export interface LinkedinBrowserConfig {
  /** Conversion IDs minted in Campaign Manager. `null` explicitly suppresses an event. */
  events: Record<string, EventBinding<string>>;
}

interface LinkedinWindow {
  lintrk?: (command: 'track', data: Record<string, unknown>) => void;
}

/**
 * Calls the host-installed LinkedIn Insight Tag for event-specific conversions.
 * LinkedIn has no event names, user-identification command or consent command.
 * Items and custom parameters have no documented slot and are not forwarded.
 *
 * @param config - The canonical event to conversion ID map.
 * @returns A browser provider; it does not install the Insight Tag.
 * @example
 * ```ts
 * import { createTracking, linkedin } from 'tracklane/browser';
 * const { track } = createTracking({
 *   providers: [linkedin({ events: { purchase: '12345' } })],
 * });
 * track('purchase', { value: 15, currency: 'BRL' }, { dedupId: 'order-1' });
 * ```
 */
export function linkedin(config: LinkedinBrowserConfig): BrowserProvider {
  return {
    name: 'linkedin',
    default: 'ignore',
    events: config.events,
    track(name: string, data: EventData, options: TrackOptions): void {
      const conversionId = Number(name);
      if (!/^\d+$/.test(name) || !Number.isSafeInteger(conversionId) || conversionId <= 0) {
        throw new Error(
          'linkedin: conversion_id must be a positive safe integer from Campaign Manager',
        );
      }
      const sdk =
        typeof window === 'undefined' ? undefined : (window as unknown as LinkedinWindow).lintrk;
      if (!sdk) {
        throw new Error(
          'linkedin: window.lintrk is missing. Install the Insight Tag before tracking.',
        );
      }
      const payload: Record<string, unknown> = { conversion_id: conversionId };
      if (data.currency !== undefined) payload.conversion_currency = data.currency;
      if (data.value !== undefined) payload.conversion_value = data.value;
      if (options.dedupId !== undefined) payload.event_id = options.dedupId;
      sdk('track', payload);
    },
  };
}
