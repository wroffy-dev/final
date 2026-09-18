import { describe, it, expect } from 'vitest';
import {
  buildCampaignUrl,
  normaliseUtmValue,
  readUtmFromUrl,
  UTM_PRESETS,
  EMPTY_UTM,
} from '@/lib/marketing/utm';

const base = { ...EMPTY_UTM, source: 'google', medium: 'cpc', campaign: 'dropbox_business' };

describe('utm campaign builder', () => {
  it('builds the link the brief asks for', () => {
    const result = buildCampaignUrl('https://example.com/dropbox-business', {
      ...base,
      content: 'hero_cta',
    });
    expect(result).toEqual({
      ok: true,
      url: 'https://example.com/dropbox-business?utm_source=google&utm_medium=cpc&utm_campaign=dropbox_business&utm_content=hero_cta',
    });
  });

  it('omits the optional parameters that were left blank', () => {
    const result = buildCampaignUrl('https://example.com/pricing', base);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.url).not.toContain('utm_term');
      expect(result.url).not.toContain('utm_content');
    }
  });

  it('keeps query parameters the destination already had', () => {
    const result = buildCampaignUrl('https://example.com/pricing?plan=advanced', base);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.url).toContain('plan=advanced');
  });

  it('replaces existing UTMs rather than stacking a second set', () => {
    const tagged = 'https://example.com/p?utm_source=old&utm_medium=old&utm_campaign=old';
    const result = buildCampaignUrl(tagged, base);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.url.match(/utm_source=/g)).toHaveLength(1);
      expect(result.url).toContain('utm_source=google');
      expect(result.url).not.toContain('old');
    }
  });

  it('clears a UTM that was emptied out', () => {
    const tagged = 'https://example.com/p?utm_term=leftover';
    const result = buildCampaignUrl(tagged, base);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.url).not.toContain('utm_term');
  });

  it('requires the three parameters that make a report readable', () => {
    expect(buildCampaignUrl('https://example.com', { ...base, source: '' })).toEqual({
      ok: false,
      error: 'Source is required — it says where the visit came from.',
    });
    expect(buildCampaignUrl('https://example.com', { ...base, medium: '' })).toEqual({
      ok: false,
      error: 'Medium is required — it says what kind of link it is.',
    });
    expect(buildCampaignUrl('https://example.com', { ...base, campaign: '' })).toEqual({
      ok: false,
      error: 'Campaign name is required so you can group the results.',
    });
  });

  it('rejects a destination that is not a usable web address', () => {
    expect(buildCampaignUrl('', base).ok).toBe(false);
    expect(buildCampaignUrl('not a url', base).ok).toBe(false);
    expect(buildCampaignUrl('javascript:alert(1)', base).ok).toBe(false);
    expect(buildCampaignUrl('ftp://example.com/file', base).ok).toBe(false);
  });

  it('normalises values so one campaign does not report as several', () => {
    expect(normaliseUtmValue('  Dropbox Business  ')).toBe('dropbox_business');
    expect(normaliseUtmValue('Q1 2026 — Launch!')).toBe('q1_2026__launch');
    expect(normaliseUtmValue('Summer Sale')).toBe(normaliseUtmValue('summer sale'));
    expect(normaliseUtmValue('a'.repeat(200))).toHaveLength(100);
  });

  it('reads UTMs back off a link so an existing one can be edited', () => {
    expect(
      readUtmFromUrl('https://example.com/p?utm_source=linkedin&utm_medium=paid_social&other=1'),
    ).toEqual({ ...EMPTY_UTM, source: 'linkedin', medium: 'paid_social' });
    expect(readUtmFromUrl('nonsense')).toEqual(EMPTY_UTM);
  });

  it('offers presets that fill the channel but leave the campaign to the admin', () => {
    expect(UTM_PRESETS.length).toBeGreaterThanOrEqual(5);
    for (const preset of UTM_PRESETS) {
      expect(preset.values.source).toBeTruthy();
      expect(preset.values.medium).toBeTruthy();
      // A preset must never decide the campaign name for you.
      expect(preset.values.campaign).toBeUndefined();
      // And its own values must already be in canonical form.
      expect(normaliseUtmValue(preset.values.source!)).toBe(preset.values.source);
      expect(normaliseUtmValue(preset.values.medium!)).toBe(preset.values.medium);
    }

    const google = UTM_PRESETS.find((preset) => preset.id === 'google-ads');
    expect(google?.values).toEqual({ source: 'google', medium: 'cpc' });
  });

  it('accepts custom values that match no preset', () => {
    const result = buildCampaignUrl('https://example.com/p', {
      ...EMPTY_UTM,
      source: 'partner_portal',
      medium: 'referral',
      campaign: 'reseller_2026',
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.url).toContain('utm_source=partner_portal');
  });
});
