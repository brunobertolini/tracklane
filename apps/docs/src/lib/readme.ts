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

/** The blockquote directly under the title. */
export function readmeTagline(): string {
  const quoted = /^>\s*(.+)$/m.exec(README);
  return quoted?.[1]?.trim() ?? '';
}

/**
 * Fenced `ts` blocks, in document order: the browser example first, the server
 * one second.
 */
export function readmeExamples(): string[] {
  return [...README.matchAll(/```ts\n([\s\S]*?)```/g)].map((match) => (match[1] ?? '').trim());
}
