import { describe, expectTypeOf, it } from 'vitest';
import { type FormatOptions, format } from './index.js';

describe('format types', () => {
  it('returns a string', () => {
    expectTypeOf(format).returns.toEqualTypeOf<string>();
  });

  it('accepts partial options', () => {
    expectTypeOf<FormatOptions>().toMatchObjectType<{ prefix?: string; trim?: boolean }>();
  });
});
