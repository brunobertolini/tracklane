import { describe, expect, it } from 'vitest';
import { isVendorResponseError, VendorResponseError } from './errors.js';

describe('VendorResponseError', () => {
  it('carries the message the provider supplied, verbatim', () => {
    // The class never composes a message out of its own fields — the
    // provider hands it one already shaped like every other error this
    // library throws (`meta: the Conversions API answered 400`), and the
    // class does not touch it.
    const error = new VendorResponseError('meta: the Conversions API answered 400', {
      provider: 'meta',
      status: 400,
      body: '{"error":{}}',
    });

    expect(error.message).toBe('meta: the Conversions API answered 400');
  });

  it('is an Error, so a host catching one the ordinary way still catches this', () => {
    const error = new VendorResponseError('ga4: the Measurement Protocol answered 500', {
      provider: 'ga4',
      status: 500,
      body: 'nope',
    });

    expect(error).toBeInstanceOf(Error);
  });

  it('exposes the provider, the status and the body it was given', () => {
    const error = new VendorResponseError('posthog: the capture endpoint answered 500', {
      provider: 'posthog',
      status: 500,
      body: '{"code":"invalid_payload"}',
    });

    expect(error.provider).toBe('posthog');
    expect(error.status).toBe(500);
    expect(error.body).toBe('{"code":"invalid_payload"}');
  });

  it('keeps a body under the cap exactly as the vendor sent it', () => {
    const body = 'a'.repeat(2047);
    const error = new VendorResponseError('meta: the Conversions API answered 400', {
      provider: 'meta',
      status: 400,
      body,
    });

    expect(error.body).toBe(body);
  });

  it('keeps a body sitting exactly on the cap untouched', () => {
    const body = 'a'.repeat(2048);
    const error = new VendorResponseError('meta: the Conversions API answered 400', {
      provider: 'meta',
      status: 400,
      body,
    });

    expect(error.body).toBe(body);
    expect(error.body).not.toContain('truncated');
  });

  it('truncates a body over the cap and marks it with a suffix', () => {
    // The cap is 2048 characters (2 KiB), and it lives in the constructor —
    // every caller gets the same guarantee for free rather than each of the
    // three providers repeating it. The suffix has to fit inside the cap,
    // not be appended past it, or "capped at 2048" is not actually true of
    // the field it is a property of.
    const body = `${'a'.repeat(2036)}${'b'.repeat(964)}`; // 3000 characters
    const error = new VendorResponseError('meta: the Conversions API answered 400', {
      provider: 'meta',
      status: 400,
      body,
    });

    expect(error.body).toHaveLength(2048);
    expect(error.body.endsWith('…[truncated]')).toBe(true);
    expect(error.body.startsWith('a'.repeat(2036))).toBe(true);
    expect(error.body).not.toContain('b');
  });

  it('recognises a real instance', () => {
    const error = new VendorResponseError('ga4: the Measurement Protocol answered 500', {
      provider: 'ga4',
      status: 500,
      body: 'nope',
    });

    expect(isVendorResponseError(error)).toBe(true);
  });

  it('does not mistake a bare Error for one', () => {
    // Preconditions (GA4 with no client_id, PostHog with no distinct_id,
    // Meta with no user_data) throw exactly this: a bare Error, because
    // there is no response to carry.
    expect(isVendorResponseError(new Error('meta: the Conversions API answered 400'))).toBe(false);
  });

  it('does not mistake null, undefined or a string for one', () => {
    expect(isVendorResponseError(null)).toBe(false);
    expect(isVendorResponseError(undefined)).toBe(false);
    expect(isVendorResponseError('meta: the Conversions API answered 400')).toBe(false);
  });

  it('recognises a structurally-branded object built without the class', () => {
    // The point of the brand: two copies of this package in one
    // node_modules produce two constructors, and `instanceof` would say
    // `false` for an instance the other copy built. A `Symbol.for` brand is
    // the same symbol across both, so this object — never touched by `new
    // VendorResponseError` — has to pass the guard too, or the guard is
    // secretly `instanceof` wearing a different name.
    const fake = {
      [Symbol.for('tracklane.VendorResponseError')]: true,
      provider: 'meta',
      status: 400,
      body: '{}',
      message: 'meta: the Conversions API answered 400',
    };

    expect(isVendorResponseError(fake)).toBe(true);
    expect(fake).not.toBeInstanceOf(VendorResponseError);
  });
});
