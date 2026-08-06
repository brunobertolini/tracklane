import { expect, it } from 'vitest';
import type { BrowserProvider } from './browser.js';
import { isVendorResponseError } from './errors.js';
import type { ResolvedContext, ServerProvider } from './server.js';
import type { EventData, ProviderDefault } from './vocabulary.js';

/**
 * The behaviour every provider owes, which the types cannot express.
 *
 * ADR-0004 requires this suite because a provider can satisfy
 * {@link BrowserProvider} or {@link ServerProvider} perfectly and still break
 * a rule the whole library rests on. The interface cannot say "never invent an
 * identifier" or "never expand a consent signal"; a test can.
 *
 * These are invariants, not vendor behaviour. What GA4 sends and how it spells
 * it belongs in the GA4 tests. What follows must hold for a provider written
 * by anyone, for a vendor nobody here has heard of.
 *
 * **Published as `tracklane/conformance`**, because the claim that a provider
 * written elsewhere uses the same contract as the ones shipped here is only
 * true if it can run the same checks. `vitest` is an optional peer: import this
 * from a test file and call one of the two functions below inside a `describe`.
 *
 * **A wrapper owes the same invariants as a provider.** Wrapping a shipped
 * provider and delegating (see the provider documentation) produces an object
 * that the dispatcher cannot tell apart from any other, so run it through here
 * too. On the server half that catches the expensive mistake: a wrapper whose
 * `track` does not `await` the provider it delegates to resolves before the
 * request settles, which a serverless runtime turns into a conversion that
 * never left. {@link conformsAsServerProvider} fails on it, because a vendor
 * refusal can no longer reach the caller.
 */

const DEFAULTS: ProviderDefault[] = ['passthrough', 'ignore'];

/** A payload with nothing in it that could excuse a difference between runs. */
const STABLE_DATA: EventData = { transaction_id: 'T-1', value: 49.9, currency: 'BRL' };

function assertIdentity(provider: { name: string; default: ProviderDefault }): void {
  it('names itself, once and stably', () => {
    // The name is what a duplicate registration is detected by, and what an
    // error report is attributed to.
    expect(provider.name).toBeTruthy();
    expect(provider.name.trim()).toBe(provider.name);
  });

  it('declares what happens to an event it has no binding for', () => {
    expect(DEFAULTS).toContain(provider.default);
  });
}

/**
 * Runs the shared conformance suite against a browser provider.
 *
 * @param create - Builds the provider under test. Called per assertion, so a
 * provider that accumulates state between runs fails rather than hides.
 * @param captured - Everything the provider handed the vendor since the last
 * reset, in order.
 * @param reset - Clears what `captured` returns.
 *
 * @example
 * ```ts
 * describe('ga4 browser conformance', () => {
 *   conformsAsBrowserProvider({
 *     create: () => ga4('G-ABC'),
 *     captured: () => calls,
 *     reset: () => { calls = []; },
 *   });
 * });
 * ```
 */
export function conformsAsBrowserProvider(options: {
  create: () => BrowserProvider;
  captured: () => unknown[];
  reset: () => void;
}): void {
  const { create, captured, reset } = options;

  assertIdentity(create());

  it('sends the same thing twice for the same event', () => {
    // The library never invents an identifier, and this is how that rule is
    // caught rather than trusted: a generated id, a random value or a clock
    // read makes two identical calls differ.
    reset();
    create().track('purchase', STABLE_DATA, {});
    const first = JSON.stringify(captured());

    reset();
    create().track('purchase', STABLE_DATA, {});
    const second = JSON.stringify(captured());

    expect(second).toBe(first);
  });

  it('forwards the deduplication id only when it was given one', () => {
    reset();
    create().track('purchase', STABLE_DATA, {});
    const without = JSON.stringify(captured());

    reset();
    create().track('purchase', STABLE_DATA, { dedupId: 'DEDUP-XYZ' });
    const with_ = JSON.stringify(captured());

    // Either the vendor has the concept, and the value appears where it did
    // not before, or it has none and nothing changes. Inventing one to fill
    // the slot is the failure this catches.
    if (with_ !== without) expect(with_).toContain('DEDUP-XYZ');
    expect(without).not.toContain('DEDUP-XYZ');
  });

  it('never expands a consent signal it was not given', () => {
    const provider = create();
    if (!provider.consent) return;

    reset();
    provider.consent('update', { analytics_storage: 'denied' });

    // One denial in must never become a grant out. Collapsing Google's
    // vocabulary for a coarser vendor is translation; widening it invents a
    // permission the visitor never gave.
    expect(JSON.stringify(captured())).not.toContain('granted');
  });
}

/**
 * Runs the shared conformance suite against a server provider.
 *
 * @param create - Builds the provider under test, per assertion.
 * @param captured - Everything the provider sent since the last reset.
 * @param reset - Clears what `captured` returns, and restores a successful
 * transport.
 * @param fail - Makes the next send fail at the transport, so the suite can
 * check that the provider is loud about it.
 * @param context - A resolved context with a fixed timestamp.
 *
 * @example
 * ```ts
 * describe('ga4 server conformance', () => {
 *   conformsAsServerProvider({
 *     create: () => ga4(credentials),
 *     captured: () => fetchMock.mock.calls,
 *     reset: () => { fetchMock.mockClear(); },
 *     fail: () => { fetchMock.mockResolvedValueOnce(new Response(null, { status: 500 })); },
 *     context,
 *   });
 * });
 * ```
 */
export function conformsAsServerProvider(options: {
  create: () => ServerProvider;
  captured: () => unknown[];
  reset: () => void;
  fail: () => void;
  context: () => ResolvedContext;
}): void {
  const { create, captured, reset, fail, context } = options;
  const noop = (): void => {};

  assertIdentity(create());

  it('sends the same thing twice for the same event', async () => {
    // The context carries a fixed timestamp, so any difference between these
    // two is something the provider produced on its own.
    reset();
    await create().track('purchase', STABLE_DATA, context(), noop);
    const first = JSON.stringify(captured());

    reset();
    await create().track('purchase', STABLE_DATA, context(), noop);

    expect(JSON.stringify(captured())).toBe(first);
  });

  it('forwards the deduplication id only when it was given one', async () => {
    reset();
    await create().track('purchase', STABLE_DATA, context(), noop);
    const without = JSON.stringify(captured());

    reset();
    await create().track('purchase', STABLE_DATA, { ...context(), dedupId: 'DEDUP-XYZ' }, noop);
    const with_ = JSON.stringify(captured());

    if (with_ !== without) expect(with_).toContain('DEDUP-XYZ');
    expect(without).not.toContain('DEDUP-XYZ');
  });

  it('throws a VendorResponseError when the vendor did not accept the send', async () => {
    // Adapters stay honest and loud. Swallowing a non-2xx is how a host ends
    // up believing it is measuring something, and the dispatcher is already
    // there to isolate the throw and report it. ADR-0013 adds the shape: what
    // reaches the host is recognised by `isVendorResponseError`, carrying the
    // status and the body, not just any throw. The body itself is
    // the caller's `fail()` hook to produce; a bodiless response is valid
    // (the documented example does exactly that), so it is not asserted here.
    reset();
    fail();

    let caught: unknown;
    try {
      await create().track('purchase', STABLE_DATA, context(), noop);
    } catch (error) {
      caught = error;
    }

    expect(isVendorResponseError(caught)).toBe(true);
    if (isVendorResponseError(caught)) {
      expect(typeof caught.status).toBe('number');
      expect(typeof caught.body).toBe('string');
    }
  });
}
