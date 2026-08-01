'use client';
import { RootProvider } from 'fumadocs-ui/provider/next';
import type { ReactNode } from 'react';
import { PageViews } from '@/components/analytics';
import { ConsentBanner } from '@/components/consent-banner';
import SearchDialog from '@/components/search';

export function Provider({ children }: { children: ReactNode }) {
  return (
    <RootProvider search={{ SearchDialog }}>
      {children}
      <PageViews />
      <ConsentBanner />
    </RootProvider>
  );
}
