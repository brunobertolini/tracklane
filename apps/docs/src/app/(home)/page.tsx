import { CircleSlash, Route, Server, ShieldOff } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { createTracking } from 'tracklane/server';
import { CodeBlock } from '@/components/code-block';
import { readmeExamples, readmeTagline } from '@/lib/readme';
import { appName, gitConfig, siteUrl } from '@/lib/shared';

// Runs the published API at build time: if the library breaks, this build
// breaks with it. Zero providers means zero network calls.
createTracking({ providers: [] });

export function generateMetadata(): Metadata {
  const description = readmeTagline();

  return {
    description,
    alternates: { canonical: '/' },
    openGraph: { description },
    twitter: { description },
  };
}

/**
 * Structured data, so a machine asking "what is tracklane" gets the same
 * answer a person does. It claims nothing the README does not.
 */
function structuredData(): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'SoftwareSourceCode',
    name: appName,
    description: readmeTagline(),
    codeRepository: `https://github.com/${gitConfig.user}/${gitConfig.repo}`,
    programmingLanguage: 'TypeScript',
    runtimePlatform: 'Node.js, browsers',
    license: 'https://opensource.org/licenses/MIT',
    url: siteUrl,
  };
}

const PROMISES = [
  {
    icon: <Route aria-hidden />,
    title: 'One event, every tool',
    body: 'Name what happened once, in GA4 vocabulary. Each provider translates it into its own. Adding a tool is a line of configuration, not a diff across your application.',
  },
  {
    icon: <Server aria-hidden />,
    title: 'Browser and server',
    body: 'Two independent libraries sharing only the vocabulary, so an event means the same thing on both sides. The conversion APIs are half the problem, and each provider covers both.',
  },
  {
    icon: <ShieldOff aria-hidden />,
    title: 'No opinions',
    body: 'It never withholds a send on policy grounds, holds no consent state, and installs no vendor tags. What reaches a tool is what a hand-written call would have sent, including the errors.',
  },
  {
    icon: <CircleSlash aria-hidden />,
    title: 'Nothing you did not ask for',
    body: 'No queue, no retry, no delivery guarantee, no runtime dependencies. One vendor failing never affects another, and never reaches your call site.',
  },
];

// Our own monograms, never a vendor's logotype: those are their trademarks and
// not ours to put on a page.
const VENDORS = [
  { name: 'GA4', mark: 'G4', shipped: true },
  { name: 'Meta', mark: 'M', shipped: false },
  { name: 'LinkedIn', mark: 'in', shipped: false },
  { name: 'PostHog', mark: 'Ph', shipped: false },
  { name: 'X', mark: 'X', shipped: false },
];

export default function HomePage() {
  const tagline = readmeTagline();
  const examples = readmeExamples().slice(0, 2);

  return (
    <main className="flex flex-1 flex-col items-center">
      <script
        type="application/ld+json"
        // biome-ignore lint/security/noDangerouslySetInnerHtml: JSON-LD has no other insertion point
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData()) }}
      />

      <section className="w-full max-w-6xl px-6 pt-20 pb-16">
        <h1 className="text-5xl font-bold tracking-tighter sm:text-6xl">{appName}</h1>
        <p className="mt-5 max-w-2xl text-lg text-fd-muted-foreground">{tagline}</p>

        <div className="mt-8 flex flex-wrap items-center gap-3">
          <Link
            href="/docs/installation/"
            className="rounded-full bg-fd-primary px-5 py-2.5 font-medium text-fd-primary-foreground"
          >
            Get started
          </Link>
          <a
            href={`https://github.com/${gitConfig.user}/${gitConfig.repo}`}
            className="rounded-full border px-5 py-2.5 font-medium"
          >
            GitHub
          </a>
          <code className="rounded-full border px-4 py-2.5 font-mono text-sm text-fd-muted-foreground">
            pnpm add tracklane
          </code>
        </div>
      </section>

      {examples.length > 0 && (
        <section className="w-full max-w-6xl border-t px-6 py-14">
          <h2 className="font-mono text-sm uppercase tracking-wide text-fd-muted-foreground">
            The same event, both sides
          </h2>
          <p className="mt-3 max-w-2xl text-sm text-fd-muted-foreground">
            Two independent libraries that share only the vocabulary, which is what makes an event
            mean the same thing in the browser and in your backend.
          </p>
          <div className="mt-6 grid items-start gap-6 lg:grid-cols-2">
            {examples.map((example, index) => (
              <CodeBlock
                key={example}
                code={example}
                title={index === 0 ? 'in the browser' : 'on your server'}
              />
            ))}
          </div>
        </section>
      )}

      <section className="w-full max-w-6xl border-t px-6 py-14">
        <div className="grid gap-8 sm:grid-cols-2">
          {PROMISES.map((promise) => (
            <div key={promise.title}>
              <div className="text-fd-muted-foreground">{promise.icon}</div>
              <h3 className="mt-3 font-semibold">{promise.title}</h3>
              <p className="mt-2 text-sm text-fd-muted-foreground">{promise.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="w-full max-w-6xl border-t px-6 py-14">
        <h2 className="font-mono text-sm uppercase tracking-wide text-fd-muted-foreground">
          Destinations
        </h2>
        <ul className="mt-6 flex flex-wrap gap-3">
          {VENDORS.map((vendor) => (
            <li
              key={vendor.name}
              className="flex items-center gap-2.5 rounded-lg border px-4 py-2.5"
            >
              <span
                aria-hidden
                className="flex size-7 items-center justify-center rounded font-mono text-xs font-semibold text-fd-muted-foreground ring-1 ring-inset ring-fd-border"
              >
                {vendor.mark}
              </span>
              {/* One string per item, not three fragments. Anything reading the
                  text rather than the layout (a screen reader, a crawler)
                  otherwise gets "MMetasoon". */}
              <span className="text-sm font-medium">
                {vendor.shipped ? vendor.name : `${vendor.name} (not yet)`}
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-6 max-w-2xl text-sm text-fd-muted-foreground">
          Any tool that receives events about what your users do can be a destination, not just ad
          pixels. Writing your own uses the same contract the built-in ones use:{' '}
          <Link href="/docs/providers/custom/" className="underline underline-offset-4">
            no registry entry, no allow-list
          </Link>
          .
        </p>
      </section>
    </main>
  );
}
