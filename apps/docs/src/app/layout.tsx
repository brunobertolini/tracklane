import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { GoogleTag } from '@/components/google-tag';
import { Provider } from '@/components/provider';
import { appName, basePath, openGraphDefaults, siteUrl, twitterDefaults } from '@/lib/shared';
import './global.css';

const inter = Inter({
  subsets: ['latin'],
});

export const metadata: Metadata = {
  // Required for absolute OG/Twitter image URLs under a static export.
  metadataBase: new URL(siteUrl),
  title: {
    default: appName,
    template: `%s · ${appName}`,
  },
  description: 'Documentation for the tracklane TypeScript library',
  openGraph: openGraphDefaults,
  twitter: twitterDefaults,
  icons: {
    icon: `${basePath}/favicon.svg`,
  },
};

export default function Layout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="en" className={inter.className} suppressHydrationWarning>
      <body className="flex flex-col min-h-screen">
        {/* First in the body, not a child of <html>: an inline script is not
            hoisted the way `<script async src>` is, and the browser moving a
            stray node into the body is a hydration mismatch. */}
        <GoogleTag />
        <Provider>{children}</Provider>
      </body>
    </html>
  );
}
