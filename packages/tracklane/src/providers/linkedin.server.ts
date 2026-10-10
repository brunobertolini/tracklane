import type { EventBinding, EventData, ResolvedContext, ServerProvider } from '../index.js';
import { VendorResponseError } from '../index.js';

/** Credentials for LinkedIn's Conversions API. */
export interface LinkedinServerCredentials {
  /** An access token authorized for the conversion's ad account. */
  accessToken: string;
}

/** Configuration for the LinkedIn Conversions API provider. */
export interface LinkedinServerConfig {
  /** Conversion IDs minted in Campaign Manager. `null` explicitly suppresses an event. */
  events: Record<string, EventBinding<string>>;
  /** LinkedIn's Marketing API version, in YYYYMM form. Defaults to `202609`. */
  apiVersion?: string;
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function ipv4(value: string): boolean {
  const parts = value.split('.');
  return parts.length === 4 && parts.every((part) => /^\d{1,3}$/.test(part) && Number(part) <= 255);
}

async function userData(context: ResolvedContext): Promise<Record<string, unknown>> {
  const user = context.user ?? {};
  // Required even when matching uses only userInfo or externalIds.
  const userIds: { idType: string; idValue: string }[] = [];
  const built: Record<string, unknown> = { userIds };
  const email = user.email?.replace(/\s/g, '').toLowerCase();
  if (email) userIds.push({ idType: 'SHA256_EMAIL', idValue: await sha256(email) });
  const clickId = context.cookies.li_fat_id;
  if (clickId) {
    // The vendor's documented cookie reader decodes URI encoding. A malformed
    // encoding must not invalidate a conversion that has another identifier.
    try {
      userIds.push({
        idType: 'LINKEDIN_FIRST_PARTY_ADS_TRACKING_UUID',
        idValue: decodeURIComponent(clickId),
      });
    } catch {
      /* malformed cookie: no identifier can be recovered */
    }
  }
  // LinkedIn supports only IPv4. Never substitute or manufacture an address.
  if (context.ip && ipv4(context.ip)) {
    userIds.push({ idType: 'PLAINTEXT_IP_ADDRESS', idValue: context.ip });
  }
  if (user.firstName && user.lastName) {
    built.userInfo = { firstName: user.firstName, lastName: user.lastName };
  }
  if (user.userId) built.externalIds = [user.userId];
  if (userIds.length === 0 && built.userInfo === undefined && built.externalIds === undefined) {
    throw new Error(
      'linkedin: the Conversions API requires a user identifier, full name, or external ID',
    );
  }
  return built;
}

/**
 * Sends event-specific conversions to LinkedIn's Conversions API.
 * Value and currency become conversionValue; items, transaction_id, custom
 * properties, traits and consent have no documented field on this endpoint.
 * The host's deduplication ID becomes eventId, without generating one.
 *
 * @param credentials - The ad account's Conversions API access token.
 * @param config - Canonical event to conversion ID map and API version.
 * @returns A server provider for `createTracking`.
 * @example
 * ```ts
 * import { createTracking, linkedin } from 'tracklane/server';
 * const { track } = createTracking({
 *   providers: [linkedin({ accessToken }, { events: { purchase: '12345' } })],
 * });
 * await track('purchase', { value: 15, currency: 'BRL' }, {
 *   user: { email: 'buyer@example.com' }, dedupId: 'order-1',
 * });
 * ```
 */
export function linkedin(
  credentials: LinkedinServerCredentials,
  config: LinkedinServerConfig,
): ServerProvider {
  const { apiVersion = '202609' } = config;
  return {
    name: 'linkedin',
    default: 'ignore',
    events: config.events,
    async track(
      name: string,
      data: EventData,
      context: ResolvedContext,
      report: (message: string) => void,
    ): Promise<void> {
      if (!/^\d+$/.test(name) || BigInt(name) <= 0n) {
        throw new Error(
          'linkedin: conversion must identify a positive conversion ID from Campaign Manager',
        );
      }
      const event: Record<string, unknown> = {
        conversion: `urn:lla:llaPartnerConversion:${name}`,
        conversionHappenedAt: context.timestamp,
        user: await userData(context),
      };
      if (data.value !== undefined && data.currency !== undefined) {
        event.conversionValue = { currencyCode: data.currency, amount: String(data.value) };
      }
      if (context.dedupId !== undefined) event.eventId = context.dedupId;
      const response = await fetch('https://api.linkedin.com/rest/conversionEvents', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${credentials.accessToken}`,
          'Content-Type': 'application/json',
          'Linkedin-Version': apiVersion,
          'X-Restli-Protocol-Version': '2.0.0',
        },
        body: JSON.stringify(event),
      });
      if (!response.ok) {
        const body = await response.text().catch(() => '');
        throw new VendorResponseError(`linkedin: the Conversions API answered ${response.status}`, {
          provider: 'linkedin',
          status: response.status,
          body,
        });
      }
      if (data.value !== undefined && data.currency === undefined) {
        report(
          'conversionValue omitted: a monetary value requires currency; the conversion rule value applies',
        );
      }
    },
  };
}
