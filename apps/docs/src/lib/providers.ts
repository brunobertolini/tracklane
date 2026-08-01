import declaration from '../../../../docs/providers.json';

/** One vendor, as the repository declares it. */
export interface DeclaredProvider {
  /** The provider's `name` in the library, and the base of its source file names. */
  id: string;
  /** How the vendor spells itself, for a reader. */
  label: string;
  /** Whether both halves exist in the library today, checked by a test in the package. */
  shipped: boolean;
}

/**
 * The single declared provider list, read rather than repeated.
 *
 * "GA4 ships today, the other four are next" used to be written by hand in six
 * places, and the 0.1.0 release corrected it in five of them. Everything on
 * this site that makes that claim reads it from here, and a test in the
 * package fails when it stops matching the source.
 */
export const providers: DeclaredProvider[] = declaration.providers;

/** Lookup by the library's own provider name. */
export function providerById(id: string): DeclaredProvider | undefined {
  return providers.find((provider) => provider.id === id);
}
