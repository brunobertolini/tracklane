import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * ADR-0004: the declared provider list must match what the source contains.
 *
 * "GA4 ships today, the other four are next" was written by hand in six
 * places. The 0.1.0 release corrected it everywhere except the
 * machine-readable index, and the surviving overclaim was found only because
 * three models were asked to read the published site with no knowledge of the
 * project. It was the first thing an LLM read about this library, and it was
 * wrong.
 *
 * This is a documentation mechanism. It is not exported, creates no registry
 * and no allow-list, and nothing about writing a provider elsewhere passes
 * through it. ADR-0003's promise that nothing is reserved is unaffected.
 */
const providersDir = import.meta.dirname;
const declarationPath = join(providersDir, '../../../../docs/providers.json');

interface Declared {
  id: string;
  label: string;
  shipped: boolean;
  serverApi: string;
}

function declared(): Declared[] {
  const file = readFileSync(declarationPath, 'utf8');
  return (JSON.parse(file) as { providers: Declared[] }).providers;
}

/**
 * A vendor is in the source when it has a file for a half. Both halves are
 * required to count as shipped: the provider contract has two of them and
 * proving one says nothing about the other.
 */
function halvesInSource(id: string): string[] {
  return readdirSync(providersDir).filter(
    (file) => file.startsWith(`${id}.`) && !file.includes('.test.'),
  );
}

describe('declared providers', () => {
  it('reads a non-empty declaration', () => {
    expect(declared().length).toBeGreaterThan(0);
  });

  it.each(declared())('$id is declared as it actually is', ({ id, shipped }) => {
    const halves = halvesInSource(id);

    if (shipped) {
      expect(halves.sort()).toEqual([`${id}.browser.ts`, `${id}.server.ts`]);
      return;
    }

    // Declaring a provider as not shipped while its source exists is the
    // harmless direction of the same drift, and still a lie in the other
    // direction: the site would tell a reader to wait for something already
    // released.
    expect(halves).toEqual([]);
  });

  /**
   * The README is the one claim we cannot generate at read time: it is a static
   * file, published to npm, and for most readers it is the only page they see.
   * So it states the table by hand and this fails when the hand is wrong.
   *
   * Compared cell by cell rather than as text, so that re-aligning the pipes is
   * not a test failure.
   */
  it('states the same providers in the published README', () => {
    const readme = readFileSync(join(providersDir, '../../README.md'), 'utf8');
    const block = /<!-- providers:start -->([\s\S]*?)<!-- providers:end -->/.exec(readme);

    expect(block, 'README lost its providers:start/end markers').not.toBeNull();

    const rows = (block?.[1] ?? '')
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.startsWith('|'))
      .map((line) =>
        line
          .slice(1, -1)
          .split('|')
          .map((cell) => cell.trim()),
      )
      .filter((cells) => !cells.every((cell) => /^-+$/.test(cell)));

    expect(rows).toEqual([
      ['Vendor', 'Conversion API', 'Status'],
      ...declared().map(({ label, serverApi, shipped }) => [
        label,
        serverApi,
        shipped ? 'shipped' : 'next',
      ]),
    ]);
  });

  it('declares every vendor present in the source', () => {
    const declaredIds = new Set(declared().map((provider) => provider.id));

    const undeclared = readdirSync(providersDir)
      .filter((file) => file.endsWith('.ts') && !file.includes('.test.'))
      .map((file) => file.split('.')[0] as string)
      .filter((id) => !declaredIds.has(id));

    expect([...new Set(undeclared)]).toEqual([]);
  });
});
