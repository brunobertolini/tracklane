'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { tracking } from '@/components/analytics';

interface CtaProps {
  href: string;
  /** What this button is, in the report. Stable across copy changes. */
  id: string;
  className?: string;
  children: ReactNode;
}

/**
 * A call to action that reports being used.
 *
 * `select_content` is GA4's own name for this, so it passes through under that
 * name and needs no binding. Leaving the page on an outbound click is not a
 * problem to solve here: gtag hands the hit to `sendBeacon`, exactly as it
 * would for a call written by hand.
 */
export function Cta({ href, id, className, children }: CtaProps): ReactNode {
  const report = (): void => {
    tracking.track('select_content', { content_type: 'cta', content_id: id });
  };

  if (href.startsWith('http')) {
    return (
      <a href={href} className={className} onClick={report}>
        {children}
      </a>
    );
  }

  return (
    <Link href={href} className={className} onClick={report}>
      {children}
    </Link>
  );
}
