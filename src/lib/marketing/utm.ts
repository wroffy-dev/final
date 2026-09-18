/**
 * UTM campaign link building.
 *
 * The values here feed the same five parameters the middleware already reads
 * into first-touch and last-touch cookies, so a link built in the admin is
 * attributed by the existing engine with nothing new to wire up.
 */

export const UTM_KEYS = ['source', 'medium', 'campaign', 'term', 'content'] as const;
export type UtmKey = (typeof UTM_KEYS)[number];

export type UtmValues = Record<UtmKey, string>;

export const EMPTY_UTM: UtmValues = {
  source: '',
  medium: '',
  campaign: '',
  term: '',
  content: '',
};

export type UtmPreset = {
  id: string;
  label: string;
  /** Only the fields the channel implies; campaign and content stay the admin's. */
  values: Partial<UtmValues>;
  hint: string;
};

/**
 * Starting points for the channels this business actually uses. They fill in
 * source and medium — the two people most often get wrong — and leave the
 * campaign name alone. Every field stays editable afterwards: a preset is a
 * shortcut, not a restriction.
 */
export const UTM_PRESETS: UtmPreset[] = [
  {
    id: 'google-ads',
    label: 'Google Ads',
    values: { source: 'google', medium: 'cpc' },
    hint: 'Paid search. Add the ad group as the term.',
  },
  {
    id: 'meta-ads',
    label: 'Meta Ads',
    values: { source: 'facebook', medium: 'paid_social' },
    hint: 'Facebook and Instagram paid placements.',
  },
  {
    id: 'linkedin',
    label: 'LinkedIn',
    values: { source: 'linkedin', medium: 'paid_social' },
    hint: 'LinkedIn Campaign Manager.',
  },
  {
    id: 'email',
    label: 'Email newsletter',
    values: { source: 'newsletter', medium: 'email' },
    hint: 'Links inside a sent campaign.',
  },
  {
    id: 'whatsapp',
    label: 'WhatsApp',
    values: { source: 'whatsapp', medium: 'message' },
    hint: 'Shared in a chat or broadcast.',
  },
  {
    id: 'organic-social',
    label: 'Organic social',
    values: { source: 'social', medium: 'organic_social' },
    hint: 'Unpaid posts on any network.',
  },
];

/**
 * Normalises a value the way analytics tools expect: lowercase, trimmed, with
 * spaces turned into underscores. "Dropbox Business" and "dropbox business"
 * would otherwise be reported as two separate campaigns.
 */
export function normaliseUtmValue(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_\-.]/g, '')
    .slice(0, 100);
}

export type UtmBuildResult = { ok: true; url: string } | { ok: false; error: string };

/**
 * Appends the filled-in parameters to a destination URL.
 *
 * Existing query parameters on the destination are kept, and any UTM already
 * present is replaced rather than duplicated — pasting a tagged URL back in
 * and re-tagging it produces one clean link, not a stacked one.
 */
export function buildCampaignUrl(baseUrl: string, values: UtmValues): UtmBuildResult {
  const trimmed = baseUrl.trim();
  if (!trimmed) return { ok: false, error: 'Choose a destination page first.' };

  if (!normaliseUtmValue(values.source)) {
    return { ok: false, error: 'Source is required — it says where the visit came from.' };
  }
  if (!normaliseUtmValue(values.medium)) {
    return { ok: false, error: 'Medium is required — it says what kind of link it is.' };
  }
  if (!normaliseUtmValue(values.campaign)) {
    return { ok: false, error: 'Campaign name is required so you can group the results.' };
  }

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return { ok: false, error: 'That destination is not a valid URL.' };
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return { ok: false, error: 'The destination must be an http or https URL.' };
  }

  for (const key of UTM_KEYS) {
    const value = normaliseUtmValue(values[key]);
    if (value) url.searchParams.set(`utm_${key}`, value);
    else url.searchParams.delete(`utm_${key}`);
  }

  return { ok: true, url: url.toString() };
}

/** Reads the UTMs already on a URL, so an existing link can be edited. */
export function readUtmFromUrl(raw: string): UtmValues {
  try {
    const url = new URL(raw.trim());
    return UTM_KEYS.reduce(
      (values, key) => {
        values[key] = url.searchParams.get(`utm_${key}`) ?? '';
        return values;
      },
      { ...EMPTY_UTM },
    );
  } catch {
    return { ...EMPTY_UTM };
  }
}
