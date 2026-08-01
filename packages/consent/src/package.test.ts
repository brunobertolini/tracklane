import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * ADR-0006: "Both packages declare zero runtime dependencies, which the
 * build asserts." The one exception is deliberate and named: `./tracklane`
 * needs `rulesFor` from its sibling package to derive categories from a
 * region, and `tracklane` itself as the peer a host only pays for by
 * importing that one entry. Nothing else may be added here without amending
 * this test, which is the point.
 */
function packageJson(): {
  dependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
} {
  const path = join(import.meta.dirname, '../package.json');
  return JSON.parse(readFileSync(path, 'utf8'));
}

describe('package.json', () => {
  it('depends on nothing beyond its own sibling consent-rules package', () => {
    expect(packageJson().dependencies).toEqual({ '@tracklane/consent-rules': 'workspace:*' });
  });

  it('takes tracklane as a peer, not a hard dependency', () => {
    expect(packageJson().peerDependencies).toEqual({ tracklane: 'workspace:*' });
  });
});
