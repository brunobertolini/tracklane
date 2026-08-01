import { highlight } from 'fumadocs-core/highlight';
import type { ReactNode } from 'react';

interface CodeBlockProps {
  code: string;
  /** Shown as the block's label: a filename, or where the code runs. */
  title?: string;
  lang?: string;
}

/**
 * Syntax-highlighted code, coloured at build time.
 *
 * This site is a static export, so Shiki runs during the build and the visitor
 * receives coloured markup with no highlighting JavaScript at all. The two
 * themes let the same markup follow the reader's light or dark preference
 * through CSS variables, rather than shipping both and hiding one.
 */
export async function CodeBlock({ code, title, lang = 'ts' }: CodeBlockProps): Promise<ReactNode> {
  const rendered = await highlight(code, {
    lang,
    themes: { light: 'github-light', dark: 'github-dark' },
    defaultColor: false,
    components: {
      // Append, never replace: Shiki puts the `shiki` class here and the
      // stylesheet keys the token colours off it. Overwriting `className`
      // leaves every colour declared in the markup and applied to nothing.
      pre: ({ className, ...props }) => (
        <pre
          {...props}
          className={`${className ?? ''} overflow-x-auto p-4 text-[13px] leading-relaxed`}
        />
      ),
    },
  });

  return (
    <figure className="overflow-hidden rounded-xl border border-white/10 bg-[#0d0d0e]">
      {title && (
        <figcaption className="border-white/10 border-b px-4 py-2.5 font-mono text-[11px] uppercase tracking-widest text-white/35">
          {title}
        </figcaption>
      )}
      {rendered}
    </figure>
  );
}
