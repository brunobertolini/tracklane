import declaration from '../../../../docs/providers.json';

/** One vendor, as the repository declares it. */
interface DeclaredProvider {
  /** The provider's `name` in the library, and the base of its source file names. */
  id: string;
  /** How the vendor spells itself, for a reader. */
  label: string;
  /** Whether both halves exist in the library today, checked by a test in the package. */
  shipped: boolean;
  /** What this vendor calls its own server-side ingestion API. */
  serverApi: string;
}

/**
 * The single declared provider list, read rather than repeated.
 *
 * "GA4 ships today, the other four are next" used to be written by hand in six
 * places, and the 0.1.0 release corrected it in five of them. Everything on
 * this site that makes that claim reads it from here, and a test in the
 * package fails when it stops matching the source.
 */
const providers: DeclaredProvider[] = declaration.providers;

const list = new Intl.ListFormat('en', { style: 'long', type: 'conjunction' });

/** Lookup by the library's own provider name. */
export function providerById(id: string): DeclaredProvider | undefined {
  return providers.find((provider) => provider.id === id);
}

/** Every declared vendor, in declaration order. */
export function declaredProviders(): DeclaredProvider[] {
  return providers;
}

/**
 * What ships and what does not, as one sentence nobody has to remember to
 * rewrite.
 *
 * The rule this repository keeps is that a status claim is generated from the
 * declared list or it is not made. A sentence like "Meta is next" is correct
 * for exactly as long as it takes to ship Meta, and the person shipping it is
 * looking at provider source, not at marketing copy. So the copy reads the same
 * file the test checks, and shipping a vendor is still one boolean.
 */
export function statusSentence(): string {
  const shipped = providers.filter((provider) => provider.shipped).map((p) => p.label);
  const pending = providers.filter((provider) => !provider.shipped).map((p) => p.label);

  if (shipped.length === 0) {
    return `${list.format(pending)} are in progress.`;
  }

  const ships = `${list.format(shipped)} ${shipped.length === 1 ? 'ships' : 'ship'} today`;

  if (pending.length === 0) {
    return `${ships}, in the browser and on the server.`;
  }

  // "one at a time" is a claim about a sequence, so it goes away once one is
  // left. Generated copy that no longer parses is worse than copy nobody
  // updated, because nobody is reading for it.
  const rest =
    pending.length === 1
      ? `${pending[0]} is next`
      : `${list.format(pending)} are next, one at a time`;

  return `${ships}, in the browser and on the server. ${rest}, verified against a real account before it ships.`;
}

/**
 * The vendors' own names for their server-side APIs, deduplicated, as a phrase.
 *
 * These are the words a reader already has when they arrive: nobody searches
 * for "server-side event forwarding", they search for the Conversions API,
 * because that is the name on the page their marketing team sent them.
 */
export function serverApiPhrase(): string {
  return list.format([...new Set(providers.map((provider) => provider.serverApi))]);
}
