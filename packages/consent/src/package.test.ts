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

describe('package.json', () => {
  it('declares no runtime dependency at all', () => {
    expect(packageJson().dependencies).toBeUndefined();
  });

  it('takes tracklane as a peer, not a hard dependency', () => {
    expect(packageJson().peerDependencies).toEqual({ tracklane: 'workspace:*' });
  });
});
