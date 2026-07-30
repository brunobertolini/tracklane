/**
 * Options accepted by {@link format}.
 *
 * TODO: replace this placeholder API with the real public surface.
 */
export interface FormatOptions {
  /**
   * String prepended to the result.
   *
   * @defaultValue `''`
   */
  prefix?: string;
  /**
   * Remove surrounding whitespace from the input before formatting.
   *
   * @defaultValue `true`
   */
  trim?: boolean;
}

/**
 * Formats an input string according to {@link FormatOptions}.
 *
 * @param input - Value to format.
 * @param options - Formatting options.
 * @returns The formatted string.
 *
 * @example
 * ```ts
 * import { format } from '@brunobertolini/tln';
 *
 * format('  hello  ', { prefix: '> ' }); // '> hello'
 * ```
 */
export function format(input: string, options: FormatOptions = {}): string {
  const { prefix = '', trim = true } = options;
  const value = trim ? input.trim() : input;

  return `${prefix}${value}`;
}
