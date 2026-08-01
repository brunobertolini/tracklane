/**
 * Types only: the vocabulary shared by both libraries, plus the two
 * provider contracts.
 *
 * The runtime lives behind `tracklane/browser` and
 * `tracklane/server`. They are separate entry points because they
 * are separate libraries: no shared runtime, no shared state, nothing in
 * common but the vocabulary below. Importing one never pulls in the other.
 *
 * A provider written outside this package imports from here and needs
 * nothing else.
 *
 * @example
 * ```ts
 * import type { BrowserProvider, EventData, TrackOptions } from 'tracklane';
 *
 * export const tiktok = (pixelId: string): BrowserProvider => ({
 *   name: 'tiktok',
 *   default: 'passthrough',
 *   install: () => loadTikTokPixel(pixelId),
 *   track: (name: string, data: EventData, options: TrackOptions) => {
 *     window.ttq?.track(name, data, { event_id: options.dedupId });
 *   },
 * });
 * ```
 *
 * @packageDocumentation
 */

export type {
  BrowserProvider,
  BrowserTracking,
  BrowserTrackingOptions,
  TrackOptions,
} from './browser.js';
export type {
  EventContext,
  ResolvedContext,
  ServerProvider,
  ServerTracking,
  ServerTrackingOptions,
} from './server.js';
export type {
  ActionSource,
  ConsentState,
  EventBinding,
  EventData,
  EventItem,
  ProviderDefault,
  TrackingError,
  UserData,
} from './vocabulary.js';
