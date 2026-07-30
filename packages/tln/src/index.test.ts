import { describe, expect, it } from 'vitest';
import { format } from './index.js';

describe('format', () => {
  it('trims the input by default', () => {
    expect(format('  hello  ')).toBe('hello');
  });

  it('keeps whitespace when trim is disabled', () => {
    expect(format('  hello  ', { trim: false })).toBe('  hello  ');
  });

  it('applies the prefix', () => {
    expect(format('hello', { prefix: '> ' })).toBe('> hello');
  });
});
