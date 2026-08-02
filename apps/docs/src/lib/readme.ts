import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The published README is the single source for the pitch and the examples.
 *
 * The home page and the npm page say the same thing because they read the same
 * file. A tagline copied into a component is a tagline that drifts, and the
 * one on npm is the one people see first.
 *
 * Read at build time only: this site is a static export.
 */
const README = readFileSync(
  join(process.cwd(), '..', '..', 'packages', 'tracklane', 'README.md'),
  'utf8',
);

/**
 * The blockquote directly under the title, however many lines it is wrapped
 * across.
 *
 * Markdown joins the lines of a blockquote into one paragraph, so reading only
 * the first of them ends the sentence wherever the author happened to hit the
 * column limit. That is not a hypothetical: it truncated the tagline on the
 * home page, in the card and in the structured data the moment the README
 * wrapped.
 */
export function readmeTagline(): string {
  const block = /^>[^\n]*(?:\n>[^\n]*)*/m.exec(README);

  const tagline = (block?.[0] ?? '')
    .split('\n')
    .map((line) => line.replace(/^>\s?/, '').trim())
    .join(' ')
    .trim();

  // The check the truncation got past. A tagline read wrongly still looks like
  // a tagline, and it reached the home page, the card and the structured data
  // before anyone noticed the sentence had no end. This is the cheapest thing
  // that can tell the difference, and the build is where it should be said.
  if (!tagline.endsWith('.')) {
    throw new Error(
      `readmeTagline: read "${tagline}", which is not a whole sentence. The blockquote under the README title is the pitch, and something is reading only part of it.`,
    );
  }

  return tagline;
}

/**
 * Fenced `ts` blocks, in document order: the browser example first, the server
 * one second.
 */
export function readmeExamples(): string[] {
  return [...README.matchAll(/```ts\n([\s\S]*?)```/g)].map((match) => (match[1] ?? '').trim());
}
