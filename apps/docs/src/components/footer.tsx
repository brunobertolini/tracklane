import type { ReactNode } from 'react';
import { appName, authorName, authorUrl, studioName, studioUrl } from '@/lib/shared';

const LINK =
  'font-medium text-white/90 underline decoration-white/25 underline-offset-4 transition-colors hover:decoration-[var(--tl-accent)]';

/** One line: who wrote this, whose roof it is under, and the licence. */
export function Footer(): ReactNode {
  return (
    <footer className="w-full border-white/[0.07] border-t">
      <p className="mx-auto w-full max-w-6xl px-6 py-10 text-center text-sm text-fd-muted-foreground">
        {appName} is built and maintained by{' '}
        <a href={authorUrl} rel="author" className={LINK}>
          {authorName}
        </a>{' '}
        at{' '}
        <a href={studioUrl} className={LINK}>
          {studioName}
        </a>
        , a software studio. MIT licensed.
      </p>
    </footer>
  );
}
