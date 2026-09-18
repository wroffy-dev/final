/**
 * First-touch / last-touch attribution rules.
 *
 * Pure decision logic, kept out of the middleware so it can be reasoned about
 * and tested directly. The middleware supplies what it read from the request
 * and applies whatever this returns.
 *
 * The rules:
 *
 *  First touch is written once and never again. It is the campaign that
 *  originally introduced the visitor, and it stays that way for a year.
 *
 *  Last touch moves for a *campaign*. A visit carrying UTM parameters always
 *  becomes the new last touch. A plain external referrer — a blog link, an
 *  organic search result, someone's bookmark — records where the visit came
 *  from only when nothing better is already credited: a visitor who arrived on
 *  a Google Ads link, left, and came back through organic search is still
 *  attributed to the ad they clicked.
 *
 *  Internal navigation never reaches this code at all, so moving around the
 *  site cannot dilute either touch.
 */

export const UTM_KEYS = [
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
] as const;

export type UtmKey = (typeof UTM_KEYS)[number];

export type Touch = Partial<Record<UtmKey, string>> & {
  referrer?: string;
  landing?: string;
  at?: string;
};

export type AttributionDecision = {
  /** Write the first-touch cookie with this value, or leave it alone. */
  writeFirst: Touch | null;
  /** Write the last-touch cookie with this value, or leave it alone. */
  writeLast: Touch | null;
};

/** True when a touch credits an actual campaign rather than only a referrer. */
export function hasCampaign(touch: Touch | null | undefined): boolean {
  if (!touch) return false;
  return UTM_KEYS.some((key) => typeof touch[key] === 'string' && touch[key]!.length > 0);
}

export function parseTouch(raw: string | null | undefined): Touch | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(decodeURIComponent(raw)) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    return parsed as Touch;
  } catch {
    // An unreadable cookie is worth nothing and may be replaced.
    return null;
  }
}

/**
 * Builds the touch this visit represents, or null when the visit carries no
 * attribution at all (plain internal traffic, or a direct visit).
 */
export function touchFromVisit(input: {
  params: Partial<Record<UtmKey, string | null>>;
  externalReferrer: string | null;
  path: string;
  at?: Date;
}): Touch | null {
  const touch: Touch = {};
  for (const key of UTM_KEYS) {
    const value = input.params[key];
    if (value) touch[key] = value.slice(0, 200);
  }

  const hasUtm = hasCampaign(touch);
  if (!hasUtm && !input.externalReferrer) return null;

  if (input.externalReferrer) touch.referrer = input.externalReferrer.slice(0, 500);
  touch.landing = input.path.slice(0, 300);
  touch.at = (input.at ?? new Date()).toISOString();
  return touch;
}

/**
 * Decides what to write, given this visit and what is already stored.
 */
export function decideAttribution(input: {
  visit: Touch | null;
  storedFirst: Touch | null;
  storedLast: Touch | null;
}): AttributionDecision {
  const { visit, storedFirst, storedLast } = input;
  if (!visit) return { writeFirst: null, writeLast: null };

  // First touch is written once, then never overwritten.
  const writeFirst = storedFirst ? null : visit;

  // A campaign always takes the last touch.
  if (hasCampaign(visit)) return { writeFirst, writeLast: visit };

  // A referrer-only visit must not displace a campaign that is already credited.
  if (hasCampaign(storedLast)) return { writeFirst, writeLast: null };

  return { writeFirst, writeLast: visit };
}
