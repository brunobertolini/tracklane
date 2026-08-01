import { describe, expect, it } from 'vitest';
import { rulesFor, surveyedAt } from './index.js';

describe('surveyedAt', () => {
  it('is a dated YYYY-MM survey', () => {
    expect(surveyedAt).toMatch(/^\d{4}-\d{2}$/);
  });
});

describe('rulesFor', () => {
  it('surveys Brazil as opt-out, offering only marketing', () => {
    const rules = rulesFor('BR');

    expect(rules.mode).toBe('opt-out');
    expect(rules.offer).toEqual(['marketing']);
    expect(rules.defaults).toEqual({ analytics: 'granted', marketing: 'granted' });
    expect(rules.source).toBeTruthy();
  });

  it('surveys Germany as opt-in, offering both purposes', () => {
    const rules = rulesFor('DE');

    expect(rules.mode).toBe('opt-in');
    expect(rules.offer).toEqual(['analytics', 'marketing']);
    expect(rules.defaults).toEqual({ analytics: 'denied', marketing: 'denied' });
    expect(rules.source).toBeTruthy();
  });

  it('surveys California as opt-out, offering only marketing', () => {
    const rules = rulesFor('US-CA');

    expect(rules.mode).toBe('opt-out');
    expect(rules.offer).toEqual(['marketing']);
    expect(rules.defaults).toEqual({ analytics: 'granted', marketing: 'granted' });
    expect(rules.source).toBeTruthy();
  });

  it('matches region codes case-insensitively', () => {
    expect(rulesFor('br')).toEqual(rulesFor('BR'));
    expect(rulesFor('us-ca')).toEqual(rulesFor('US-CA'));
  });

  it('falls back to the strict configuration for an unsurveyed region', () => {
    const rules = rulesFor('JP');

    expect(rules.mode).toBe('opt-in');
    expect(rules.offer).toEqual(['analytics', 'marketing']);
    expect(rules.defaults).toEqual({ analytics: 'denied', marketing: 'denied' });
    expect(rules.source).toBeTruthy();
  });

  it('never returns a rule without a source', () => {
    for (const region of ['BR', 'DE', 'US-CA', 'unsurveyed-region']) {
      expect(rulesFor(region).source.length).toBeGreaterThan(0);
    }
  });
});
