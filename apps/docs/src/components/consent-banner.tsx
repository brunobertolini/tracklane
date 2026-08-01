'use client';

import type { ReactNode } from 'react';
import { useSyncExternalStore } from 'react';
import { tracking } from '@/components/analytics';

const { consent } = tracking;

/**
 * Marketing is always denied: this site runs no advertising, so there is
 * nothing to ask about beyond measurement. Both buttons answer the full
 * record because `consent.answer` takes one, never a partial one (ADR-0006):
 * a partial answer would let a later change to the defaults silently rewrite
 * what the visitor actually decided.
 */
function respond(analytics: 'granted' | 'denied'): void {
  consent.answer({ analytics, marketing: 'denied' });
}

/**
 * Asks once, for analytics only, and stores the answer in the cookie
 * `@tracklane/consent` reads on both the browser and the server.
 *
 * The server renders nothing, and so does the client's first render: whether
 * a cookie already holds an answer is unknowable until the browser reads it,
 * so `getServerSnapshot` always reports "answered" for that first paint.
 * React checks the real value again right after hydration: an unanswered
 * visitor sees the banner appear then; an already-answered one never sees it
 * at all, which is the point: no flash of a question already settled.
 */
export function ConsentBanner(): ReactNode {
  const answered = useSyncExternalStore(
    consent.subscribe,
    () => consent.answered,
    () => true,
  );

  if (answered) return null;

  return (
    // Bottom right, clear of the hero's own call to action on the left. Full
    // width only where there is no room beside it.
    <div className="fixed inset-x-4 bottom-4 z-50 sm:inset-x-auto sm:right-5 sm:bottom-5 sm:w-72">
      <div className="rounded-lg border border-fd-border bg-fd-popover p-3 shadow-lg ring-1 ring-black/5 dark:ring-white/10">
        {/* Not "nothing is sent until you choose": Google's tag is configured
            on load and reports the landing page either way. What the answer
            changes is whether it may keep anything on this device. */}
        <p className="text-xs leading-snug text-fd-muted-foreground">
          Page views to Google Analytics, measured with tracklane itself. Until you accept, it runs
          without cookies and stores nothing on this device.
        </p>
        {/* Same size and shape for both, so neither reads as the safe one.
            Only the colour separates primary from secondary. */}
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => respond('denied')}
            className="rounded-md bg-fd-secondary px-3 py-1.5 text-xs font-medium text-fd-secondary-foreground transition-colors hover:bg-fd-accent"
          >
            Refuse
          </button>
          <button
            type="button"
            onClick={() => respond('granted')}
            className="rounded-md bg-fd-primary px-3 py-1.5 text-xs font-medium text-fd-primary-foreground transition-opacity hover:opacity-90"
          >
            Accept
          </button>
        </div>
      </div>
    </div>
  );
}
