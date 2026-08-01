import { highlight } from 'fumadocs-core/highlight';
import type { CSSProperties, ReactNode } from 'react';

/**
 * The call the application makes. One name, in GA4's vocabulary, written once.
 */
const CALL = "track('purchase', { transaction_id: 'T-1024', value: 49.9, currency: 'BRL' })";

/**
 * What each vendor receives, written the way that vendor documents it.
 *
 * These are not illustrations: each line is the call a developer would have
 * written by hand for that tool, which is the rule the whole library is held
 * to. They are worth reading closely, because the differences are the argument.
 * `purchase` becomes `Purchase` at Meta and a dashboard number at LinkedIn and
 * X; the same deduplication id travels as `eventID`, `event_id` and
 * `conversion_id`.
 *
 * `shipped` tracks reality rather than ambition. Four of these translate
 * correctly and do not yet send, and the panel says so.
 *
 * Source for every shape: `docs/research/providers.md`.
 */
const TRANSLATIONS = [
  {
    name: 'GA4',
    mark: 'G4',
    shipped: true,
    code: "gtag('event', 'purchase', { transaction_id: 'T-1024', value: 49.9, currency: 'BRL' })",
  },
  {
    name: 'Meta',
    mark: 'M',
    shipped: false,
    code: "fbq('track', 'Purchase', { value: 49.9, currency: 'BRL' }, { eventID: 'T-1024' })",
  },
  {
    name: 'LinkedIn',
    mark: 'in',
    shipped: false,
    code: "lintrk('track', { conversion_id: 8421066, conversion_value: 49.9, currency: 'BRL', event_id: 'T-1024' })",
  },
  {
    name: 'PostHog',
    mark: 'Ph',
    shipped: false,
    code: "posthog.capture('purchase', { transaction_id: 'T-1024', value: 49.9, currency: 'BRL' })",
  },
  {
    name: 'X',
    mark: 'X',
    shipped: false,
    code: "twq('event', 'tw-o1abc-oq2de', { value: 49.9, currency: 'BRL', conversion_id: 'T-1024' })",
  },
];

/**
 * One line of Shiki-coloured code with no block of its own.
 *
 * The `pre` keeps the `shiki` class it arrives with, because the stylesheet
 * keys every token colour off it, and loses the padding the same stylesheet
 * assumes a code block wants.
 */
async function Line({ code }: { code: string }): Promise<ReactNode> {
  return highlight(code, {
    lang: 'ts',
    themes: { light: 'github-light', dark: 'github-dark' },
    defaultColor: false,
    components: {
      pre: ({ className, ...props }) => (
        <pre
          {...props}
          className={`${className ?? ''} w-max bg-transparent! font-mono text-[12.5px] leading-6`}
          style={{ '--padding-left': '0px', '--padding-right': '0px' } as CSSProperties}
        />
      ),
    },
  });
}

/**
 * The hero's stage: one call at the top, five vendor calls below it.
 *
 * A library has no product screenshot, and its one interesting moment is
 * exactly this fan-out, which no amount of prose delivers as quickly.
 *
 * It animates on load rather than on a loop: the panel sits above the fold, so
 * the cascade is seen once, and a hero that never stops moving is a hero that
 * has to be scrolled past.
 */
export function FanOut(): ReactNode {
  return (
    <figure className="tl-panel overflow-hidden rounded-xl border border-white/10 bg-[#0d0d0e] shadow-2xl shadow-black/60">
      <div className="flex items-center gap-3 border-b border-white/10 px-4 py-2.5 sm:px-5">
        <span className="font-mono text-[11px] uppercase tracking-widest text-white/35">
          your application
        </span>
      </div>

      <div className="overflow-x-auto px-4 py-4 sm:px-5">
        <Line code={CALL} />
      </div>

      <div className="flex items-center gap-3 border-y border-white/10 bg-white/[0.02] px-4 py-2.5 sm:px-5">
        <span className="font-mono text-[11px] uppercase tracking-widest text-white/35">
          what each tool receives
        </span>
      </div>

      <ul>
        {TRANSLATIONS.map((vendor, index) => (
          <li
            key={vendor.name}
            className="tl-fan-row flex flex-col gap-1.5 border-b border-white/5 px-4 py-3 last:border-b-0 sm:flex-row sm:items-center sm:gap-4 sm:px-5"
            style={{ '--tl-fan-index': index } as CSSProperties}
          >
            <div className="flex shrink-0 items-center gap-2.5 sm:w-44">
              {/* Our own monogram, never a vendor's logotype: those are their
                  trademarks and not ours to put on a page. */}
              <span
                aria-hidden
                className="flex size-6 shrink-0 items-center justify-center rounded font-mono text-[10px] font-semibold text-white/50 ring-1 ring-inset ring-white/15"
              >
                {vendor.mark}
              </span>
              <span className="text-sm font-medium text-white/85">{vendor.name}</span>
              {/* One string, not three fragments: anything reading the text
                  rather than the layout otherwise gets "Metasoon". */}
              <span className="sr-only">{vendor.shipped ? 'shipped' : 'not shipped yet'}</span>
              <span
                aria-hidden
                className={`rounded-full px-1.5 py-0.5 font-mono text-[10px] ${
                  vendor.shipped
                    ? 'bg-[var(--tl-accent)]/15 text-[var(--tl-accent)]'
                    : 'text-white/30 ring-1 ring-inset ring-white/10'
                }`}
              >
                {vendor.shipped ? 'shipped' : 'soon'}
              </span>
            </div>
            <div className="min-w-0 overflow-x-auto">
              <Line code={vendor.code} />
            </div>
          </li>
        ))}
      </ul>
    </figure>
  );
}
