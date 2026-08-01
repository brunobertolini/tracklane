import type { ReactNode } from 'react';
import { appName, authorName, authorUrl } from '@/lib/shared';

/** One line: who wrote this, where to find them, and the licence. */
export function Footer(): ReactNode {
  return (
    <footer className="w-full border-white/[0.07] border-t">
      <p className="mx-auto w-full max-w-6xl px-6 py-10 text-center text-sm text-fd-muted-foreground">
        {appName} is built and maintained by{' '}
        <a
          href={authorUrl}
          rel="author"
          className="font-medium text-white/90 underline decoration-white/25 underline-offset-4 transition-colors hover:decoration-[var(--tl-accent)]"
        >
          {authorName}
        </a>
        . MIT licensed.
      </p>
    </footer>
  );
}
