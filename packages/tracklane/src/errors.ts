const BRAND = Symbol.for('tracklane.VendorResponseError');

/** The vendor's own answer to a refusal, capped so it cannot grow without bound. */
const BODY_CAP = 2048;
const TRUNCATION_SUFFIX = '…[truncated]';

function capBody(body: string): string {
  if (body.length <= BODY_CAP) return body;
  return `${body.slice(0, BODY_CAP - TRUNCATION_SUFFIX.length)}${TRUNCATION_SUFFIX}`;
}

/**
 * Thrown by a server provider when the vendor's endpoint answers with a
 * non-2xx status. The message stays exactly what the provider composed,
 * free of the payload, per `TrackingError`'s guarantee, and the vendor's own
 * answer travels separately on `status` and `body`, for a host that asks for
 * it via `onError` rather than a host that logs by default.
 *
 * See ADR-0013 for why the split exists and why `body` is a property rather
 * than `cause`.
 *
 * @param message - The same one-line message the provider already throws
 * today (e.g. `meta: the Conversions API answered 400`). Not composed here.
 * @param details - The vendor's own answer: `provider` is the name it
 * registers under, `status` is the HTTP status, and `body` is the response
 * body verbatim, capped at 2048 characters with a `…[truncated]` suffix that
 * fits inside the cap.
 *
 * @example
 * ```ts
 * throw new VendorResponseError(`meta: the Conversions API answered ${status}`, {
 *   provider: 'meta',
 *   status,
 *   body: await response.text().catch(() => ''),
 * });
 * ```
 */
export class VendorResponseError extends Error {
  readonly provider: string;
  readonly status: number;
  readonly body: string;

  constructor(message: string, details: { provider: string; status: number; body: string }) {
    super(message);
    this.name = 'VendorResponseError';
    this.provider = details.provider;
    this.status = details.status;
    this.body = capBody(details.body);
    Object.defineProperty(this, BRAND, { value: true });
  }
}

/**
 * Tests the brand `VendorResponseError` sets, not `instanceof`: two copies
 * of this package in one `node_modules` produce two constructors, and
 * `instanceof` would say `false` for an instance the other copy built. The
 * `Symbol.for` brand is the same symbol across both.
 *
 * @param value - Anything a `catch` block might hand back.
 * @returns Whether `value` carries the `VendorResponseError` brand.
 *
 * @example
 * ```ts
 * try {
 *   await track.server('purchase', data, context);
 * } catch (error) {
 *   if (isVendorResponseError(error)) {
 *     reportWithFingerprint(error.provider, error.status, error.body);
 *   }
 * }
 * ```
 */
export function isVendorResponseError(value: unknown): value is VendorResponseError {
  return typeof value === 'object' && value !== null && BRAND in value;
}
