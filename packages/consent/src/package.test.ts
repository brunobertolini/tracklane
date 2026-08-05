import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * ADR-0006: both packages declare zero runtime dependencies, which the build
 * asserts. The only entry in the graph is `tracklane` as a peer, paid for
 * solely by a host that imports the `./tracklane` entry point. Nothing else
 * may be added without amending this test, which is the point.
 *
 * `@tracklane/consent-rules` is deliberately absent: a host that wants a
 * jurisdiction to pick its categories passes `rulesFor(region).defaults`
 * itself, so the two packages never meet.
 */
function packageJson(): {
  dependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
} {
  const path = join(import.meta.dirname, '../package.json');
  return JSON.parse(readFileSync(path, 'utf8'));
}

/** `0.4.2` → `[0, 4, 2]`, so two versions can be compared segment by segment. */
function parts(version: string): number[] {
  return version.split('.').map((segment) => Number(segment) || 0);
}

function compare(a: string, b: string): number {
  const left = parts(a);
  const right = parts(b);

  for (let i = 0; i < 3; i += 1) {
    const difference = (left[i] ?? 0) - (right[i] ?? 0);
    if (difference !== 0) return difference;
  }

  return 0;
}

/**
 * Whether a `>=lower <upper` range accepts every minor below 1.0 and stops
 * there. Written out rather than pulled from `semver`, because a package that
 * declares zero runtime dependencies should not grow one for its own test.
 */
function satisfiesEveryMinorOfZeroX(range: string): boolean {
  const tokens = range.trim().split(/\s+/);
  const lower = tokens.find((token) => token.startsWith('>='))?.slice(2);
  const upper = tokens.find((token) => token.startsWith('<') && !token.startsWith('<='))?.slice(1);

  if (!lower || !upper) return false;

  const accepts = (version: string): boolean =>
    compare(version, lower) >= 0 && compare(version, upper) < 0;

  return accepts('0.3.0') && accepts('0.9.9') && !accepts('1.0.0');
}

describe('package.json', () => {
  it('declares no runtime dependency at all', () => {
    expect(packageJson().dependencies).toBeUndefined();
  });

  it('takes tracklane as a peer, and nothing else', () => {
    expect(Object.keys(packageJson().peerDependencies ?? {})).toEqual(['tracklane']);
  });

  it('spans the core’s 0.x line rather than pinning one version of it', () => {
    // This was `workspace:*`, which publishes as whichever exact version of
    // `tracklane` happened to be current. Every core release then left this
    // range, so `@tracklane/consent@1.0.0` reached npm demanding exactly
    // `tracklane@0.2.0` and refusing `0.3.0` — a real incompatibility, and a
    // major burned here for a change that was never ours.
    //
    // A caret would not fix it: `^0.2.0` excludes `0.3.0` while the core is
    // below 1.0, so every minor would still be breaking. Hence an explicit
    // range, and hence this test, which fails if someone narrows it back.
    const range = packageJson().peerDependencies?.tracklane ?? '';

    expect(range).not.toMatch(/^workspace:/);
    expect(satisfiesEveryMinorOfZeroX(range)).toBe(true);
  });
});
