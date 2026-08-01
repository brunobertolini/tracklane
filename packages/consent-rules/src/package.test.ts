import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * ADR-0006: "Both packages declare zero runtime dependencies, which the
 * build asserts." A dependency added in good faith — a date-formatting
 * helper, a schema validator — is exactly the kind of small convenience the
 * ADR names as how the four prior consent attempts each began. This is the
 * assertion the ADR promises.
 */
function packageJson(): { dependencies?: Record<string, string> } {
  const path = join(import.meta.dirname, '../package.json');
  return JSON.parse(readFileSync(path, 'utf8'));
}

describe('package.json', () => {
  it('declares zero runtime dependencies', () => {
    expect(packageJson().dependencies).toBeUndefined();
  });
});
