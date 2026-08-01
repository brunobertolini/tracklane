import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * ADR-0004 requires that a provider may import only what the package exports
 * publicly. Without this check the rule holds exactly as long as whoever is
 * reading remembers it, and the providers shipped here had already drifted:
 * both reached into `../vocabulary.js`, a path no provider written elsewhere
 * can address.
 *
 * That drift is the failure worth catching, because it is silent. The contract
 * quietly stops describing every provider and starts describing the official
 * ones, and nobody finds out until an outside provider cannot be written
 * without copying the package.
 */
const providersDir = import.meta.dirname;

/** Every relative import in a source file, in source order. */
function relativeImports(source: string): string[] {
  return [...source.matchAll(/from\s+'(\.[^']*)'/g)].map((match) => match[1] as string);
}

function providerSources(): string[] {
  return readdirSync(providersDir).filter(
    (file) => file.endsWith('.ts') && !file.includes('.test.'),
  );
}

describe('provider import boundary', () => {
  it('has providers to check', () => {
    // A regex that silently matches nothing would make every assertion below
    // pass on an empty list, which is the way this kind of check dies.
    expect(providerSources().length).toBeGreaterThan(0);
  });

  it.each(providerSources())('%s imports the package only through its public entry', (file) => {
    const source = readFileSync(join(providersDir, file), 'utf8');

    const reachingInside = relativeImports(source).filter(
      // Staying inside `providers/` is fine: that is one vendor's own files.
      // Leaving it is only allowed through the entry point every provider
      // written elsewhere also has.
      (specifier) => specifier.startsWith('../') && specifier !== '../index.js',
    );

    expect(reachingInside).toEqual([]);
  });
});
