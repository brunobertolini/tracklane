import { ArrowRight, CircleSlash, Route, Server, ShieldOff } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { createTracking } from 'tracklane/server';
import { CodeBlock } from '@/components/code-block';
import { Cta } from '@/components/cta';
import { FanOut } from '@/components/fan-out';
import { declaredProviders, serverApiPhrase, statusSentence } from '@/lib/providers';
import { readmeExamples, readmeTagline } from '@/lib/readme';
import {
  appName,
  basePath,
  gitConfig,
  homeImageRoute,
  openGraphDefaults,
  siteUrl,
  twitterDefaults,
} from '@/lib/shared';

// Runs the published API at build time: if the library breaks, this build
// breaks with it. Zero providers means zero network calls.
createTracking({ providers: [] });

export function generateMetadata(): Metadata {
  const description = readmeTagline();

  // Stated rather than inferred: `metadataBase` makes the URL absolute but
  // does not add `basePath`, and the dimensions let a crawler lay the card out
  // before it has finished fetching the image.
  const images = [
    {
      url: `${basePath}${homeImageRoute}`,
      width: 1200,
      height: 630,
      alt: 'Name the event once. Every tool gets its own.',
    },
  ];

  return {
    description,
    alternates: { canonical: '/' },
    // Spread, never replace: see `openGraphDefaults`.
    openGraph: { ...openGraphDefaults, description, images },
    twitter: { ...twitterDefaults, description, images },
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

/**
 * The three shapes every section below the hero is built from. Written once so
 * that a change to the rhythm is a change in one place, and so that a new
 * section cannot quietly invent its own scale.
 */
const LABEL = 'font-mono text-[11px] uppercase tracking-widest text-white/35';
const HEADING = 'mt-4 text-3xl font-semibold leading-[1.1] tracking-[-0.025em] sm:text-4xl';
const LEDE = 'mt-5 max-w-2xl leading-relaxed text-fd-muted-foreground';

const PROMISES = [
  {
    icon: <Route aria-hidden />,
    title: 'One event, every tool',
    body: 'Name what happened once, in GA4 vocabulary. Each provider translates it into its own. Adding a tool is a line of configuration, not a diff across your application.',
  },
  {
    icon: <Server aria-hidden />,
    title: 'Pixels and conversion APIs',
    body: 'The server-side APIs are the expensive half: hashed identifiers, deduplication against the browser event, a different payload shape per vendor. Every provider ships both halves, and neither is an add-on.',
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
const MARKS: Record<string, string> = {
  ga4: 'G4',
  meta: 'M',
  linkedin: 'in',
  posthog: 'Ph',
  x: 'X',
};

/**
 * The label, the status and the vendor's own API name all come from the
 * declared list. Only the monogram is ours, so only the monogram is here.
 */
const VENDORS = declaredProviders().map((provider) => ({
  ...provider,
  mark: MARKS[provider.id] ?? provider.label.slice(0, 2),
}));

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

      <section className="relative w-full overflow-hidden">
        <div aria-hidden className="tl-glow">
          <span className="tl-glow__rays" />
          <span className="tl-glow__origin">
            <span className="tl-glow__core" />
            <span className="tl-glow__beam tl-glow__beam--haze" />
            <span className="tl-glow__beam" />
          </span>
        </div>

        <div className="relative mx-auto w-full max-w-6xl px-6 pt-20 pb-16 sm:pt-28">
          <h1 className="max-w-4xl text-5xl font-semibold leading-[0.98] tracking-[-0.035em] sm:text-6xl lg:text-7xl">
            Name the event once.
            <br />
            Every tool gets its own.
          </h1>

          <p className="mt-6 max-w-xl text-lg leading-relaxed text-fd-muted-foreground">
            {tagline}
          </p>

          <div className="mt-9 flex flex-wrap items-center gap-3">
            <Cta
              href="/docs/installation/"
              id="get-started"
              className="inline-flex items-center gap-2 rounded-lg bg-[var(--tl-accent)] px-5 py-2.5 font-medium text-black transition-opacity hover:opacity-90"
            >
              Get started
              <ArrowRight aria-hidden className="size-4" />
            </Cta>
            <Cta
              href={`https://github.com/${gitConfig.user}/${gitConfig.repo}`}
              id="github"
              className="rounded-lg border border-white/15 bg-white/5 px-5 py-2.5 font-medium transition-colors hover:bg-white/10"
            >
              View on GitHub
            </Cta>
            <code className="px-1 font-mono text-sm text-fd-muted-foreground">
              pnpm add tracklane
            </code>
          </div>

          <div className="mt-16 sm:mt-20">
            <FanOut />
          </div>
        </div>
      </section>

      {examples.length > 0 && (
        <section className="w-full max-w-6xl border-white/[0.07] border-t px-6 py-20">
          <p className={LABEL}>the vocabulary</p>
          <h2 className={HEADING}>The same event, both sides.</h2>
          <p className={LEDE}>
            Two independent libraries that share only the vocabulary, which is what makes an event
            mean the same thing in the browser and in your backend. The server half speaks each
            vendor's own conversion API, {serverApiPhrase()}, from a call that looks like the
            browser one. No shared runtime, no shared state, and nothing to keep in sync but the
            name.
          </p>
          <div className="mt-10 grid items-start gap-5 lg:grid-cols-2">
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

      <section className="w-full max-w-6xl border-white/[0.07] border-t px-6 py-20">
        <p className={LABEL}>the rule</p>
        <h2 className={HEADING}>
          It standardises and organises.
          <br />
          It never changes behaviour.
        </h2>
        <p className={LEDE}>
          Every decision is settled by one question: if you did not have this library, how would you
          write this line by hand? It replicates exactly that.
        </p>
        <div className="mt-10 grid gap-4 sm:grid-cols-2">
          {PROMISES.map((promise) => (
            <div key={promise.title} className="rounded-xl border border-white/10 bg-[#0d0d0e] p-6">
              <div className="text-[var(--tl-accent)]">{promise.icon}</div>
              <h3 className="mt-4 font-semibold text-white/90">{promise.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-fd-muted-foreground">
                {promise.body}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className="w-full max-w-6xl border-white/[0.07] border-t px-6 py-20">
        <p className={LABEL}>destinations</p>
        <h2 className={HEADING}>Five in v1, and anything else you write.</h2>
        <p className={LEDE}>
          Any tool that receives events about what your users do can be a destination, not just ad
          pixels. Writing your own uses the same contract the built-in ones use:{' '}
          <Link
            href="/docs/providers/custom/"
            className="text-white/80 underline decoration-white/25 underline-offset-4 transition-colors hover:decoration-white/60"
          >
            no registry entry, no allow-list
          </Link>
          .
        </p>
        <ul className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {VENDORS.map((vendor) => (
            <li
              key={vendor.id}
              className="flex items-center gap-3 rounded-xl border border-white/10 bg-[#0d0d0e] px-4 py-3.5"
            >
              <span
                aria-hidden
                className="flex size-8 shrink-0 items-center justify-center rounded font-mono text-xs font-semibold text-white/50 ring-1 ring-inset ring-white/15"
              >
                {vendor.mark}
              </span>
              {/* One string per item, not four fragments. Anything reading the
                  text rather than the layout (a screen reader, a crawler)
                  otherwise gets "MMetaConversions APIsoon". */}
              <span className="sr-only">
                {vendor.label}, {vendor.serverApi}, {vendor.shipped ? 'shipped' : 'not shipped yet'}
              </span>
              <span aria-hidden className="min-w-0">
                <span className="block font-medium text-white/85">{vendor.label}</span>
                <span className="block truncate text-[11px] text-white/35">{vendor.serverApi}</span>
              </span>
              <span
                aria-hidden
                className={`ml-auto rounded-full px-2 py-0.5 font-mono text-[10px] ${
                  vendor.shipped
                    ? 'bg-[var(--tl-accent)]/15 text-[var(--tl-accent)]'
                    : 'text-white/30 ring-1 ring-inset ring-white/10'
                }`}
              >
                {vendor.shipped ? 'shipped' : 'soon'}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="w-full max-w-6xl border-white/[0.07] border-t px-6 py-20">
        <div className="rounded-2xl border border-white/10 bg-[#0d0d0e] px-6 py-12 text-center sm:px-12">
          <h2 className="text-3xl font-semibold tracking-[-0.02em] sm:text-4xl">
            Start with one tool.
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-fd-muted-foreground leading-relaxed">
            {statusSentence()}
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Cta
              href="/docs/installation/"
              id="get-started-footer"
              className="inline-flex items-center gap-2 rounded-lg bg-[var(--tl-accent)] px-5 py-2.5 font-medium text-black transition-opacity hover:opacity-90"
            >
              Get started
              <ArrowRight aria-hidden className="size-4" />
            </Cta>
            <code className="rounded-lg border border-white/10 px-4 py-2.5 font-mono text-sm text-fd-muted-foreground">
              pnpm add tracklane
            </code>
          </div>
        </div>
      </section>
    </main>
  );
}
