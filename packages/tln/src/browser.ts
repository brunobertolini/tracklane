import { assertUniqueProviders, makeReporter, messageOf, resolveEvent } from './dispatch.js';

export { type Ga4BrowserConfig, ga4 } from './providers/ga4.browser.js';

import type {
  ConsentState,
  EventBinding,
  EventData,
  ProviderDefault,
  TrackingError,
  UserData,
} from './vocabulary.js';

/**
 * Everything the browser needs beyond the event itself.
 *
 * There is one field, and that is the point: in the browser each vendor tag
 * reads its own cookies and holds its own session, so the only thing left
 * for the host to supply is the value that ties this hit to a server-side
 * one.
 */
export interface TrackOptions {
  /**
   * The value that lets a vendor recognise this hit and a server-side hit as
   * one event. The library never invents it — the browser and the server do
   * not share a process, so only a value the host already owns (an order id)
   * can match on both sides.
   */
  dedupId?: string;
}

/**
 * A destination for browser events.
 *
 * This is the whole contract, and it is what a provider written outside this
 * package implements — the ones shipped here get no shortcut.
 */
export interface BrowserProvider<Target = string> {
  /** The vendor's fixed name. Registering one twice is an error. */
  name: string;
  /** What happens to a canonical event this vendor has no binding for. */
  default: ProviderDefault;
  /** How this vendor spells each canonical event. */
  events?: Record<string, EventBinding<Target>>;
  /** Loads the vendor tag. Runs once, at creation. */
  install?(): void | Promise<void>;
  track(name: Target, data: EventData, options: TrackOptions): void;
  /** Absent where the vendor keeps no user of its own. */
  identify?(user: UserData, traits?: Record<string, unknown>): void;
  /** Absent where the vendor documents no consent command. */
  consent?(command: 'default' | 'update', state: ConsentState): void;
}

/** Options accepted by {@link createTracking}. */
export interface BrowserTrackingOptions {
  providers: readonly BrowserProvider[];
  /**
   * The one diagnostic channel. Without it the library is silent, exactly as
   * a hand-written vendor call is.
   */
  onError?: (error: TrackingError) => void;
}

/** What {@link createTracking} returns. */
export interface BrowserTracking {
  /** Sends one event to every configured vendor. Never throws. */
  track(name: string, data?: EventData, options?: TrackOptions): void;
  /** Forwards the user to the vendors that hold one, and to nobody else. */
  identify(user: UserData, traits?: Record<string, unknown>): void;
  /**
   * Forwards a consent declaration to every vendor that documents a command
   * for it. It never decides, stores or withholds anything.
   */
  consent(command: 'default' | 'update', state: ConsentState): void;
}

/**
 * Creates the browser tracking surface.
 *
 * Providers install eagerly, which is what pasting a vendor snippet does and
 * what lets each vendor record its own initial page view. Every vendor
 * shipped here queues its own commands until its script lands, so nothing is
 * lost to loading and this library needs no queue of its own.
 *
 * @param options - The providers to send to, and an optional error channel.
 * @returns The `track`, `identify` and `consent` calls.
 *
 * @example
 * ```ts
 * import { createTracking, ga4 } from '@brunobertolini/tln/browser';
 *
 * const { track } = createTracking({ providers: [ga4('G-XXXXXXX')] });
 * track('purchase', { transaction_id: 'T-1', value: 49.9, currency: 'BRL' });
 * ```
 */
export function createTracking(options: BrowserTrackingOptions): BrowserTracking {
  const { providers } = options;
  assertUniqueProviders(providers);

  const report = makeReporter(options.onError);

  const fail = (provider: string, event: string, cause: unknown): void => {
    report({ provider, event, severity: 'error', message: messageOf(cause), cause });
  };

  for (const provider of providers) {
    try {
      const installing = provider.install?.();
      // An async loader that rejects would otherwise become an unhandled
      // rejection — the silent failure this channel exists to prevent.
      void Promise.resolve(installing).catch((cause: unknown) => {
        fail(provider.name, 'install', cause);
      });
    } catch (cause) {
      fail(provider.name, 'install', cause);
    }
  }

  return {
    track(name, data = {}, trackOptions = {}) {
      for (const provider of providers) {
        const target = resolveEvent(provider, name);
        if (target === undefined) continue;

        try {
          provider.track(target, data, trackOptions);
        } catch (cause) {
          fail(provider.name, name, cause);
        }
      }
    },

    identify(user, traits) {
      for (const provider of providers) {
        try {
          provider.identify?.(user, traits);
        } catch (cause) {
          fail(provider.name, 'identify', cause);
        }
      }
    },

    consent(command, state) {
      for (const provider of providers) {
        try {
          provider.consent?.(command, state);
        } catch (cause) {
          fail(provider.name, 'consent', cause);
        }
      }
    },
  };
}
