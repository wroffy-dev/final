/**
 * Date ranges for the CRM dashboard and reports.
 *
 * Two rules drive everything here:
 *
 * 1. A range is a pair of *calendar days* in the server's local zone, not a
 *    pair of instants. "Today" means midnight-to-midnight where the business
 *    is, so a lead that arrived at 11pm counts as today's, not tomorrow's.
 *    `toISOString().slice(0, 10)` is exactly the wrong tool for this — it
 *    converts to UTC first and silently shifts the day for anyone east or
 *    west of Greenwich — so every day string here is built from the local
 *    getFullYear/getMonth/getDate triple instead.
 *
 * 2. Filtering happens in the database. These helpers only produce the
 *    boundaries; the caller hands them to Prisma.
 */

export const RANGE_PRESETS = [
  'today',
  'yesterday',
  'last7',
  'last30',
  'thisMonth',
  'lastMonth',
  'thisQuarter',
  'thisYear',
  'custom',
] as const;

export type RangePreset = (typeof RANGE_PRESETS)[number];

export const RANGE_PRESET_LABELS: Record<RangePreset, string> = {
  today: 'Today',
  yesterday: 'Yesterday',
  last7: 'Last 7 days',
  last30: 'Last 30 days',
  thisMonth: 'This month',
  lastMonth: 'Last month',
  thisQuarter: 'This quarter',
  thisYear: 'This year',
  custom: 'Custom range',
};

export type DateRange = {
  preset: RangePreset;
  /** Inclusive yyyy-mm-dd day strings, in local time. */
  from: string;
  to: string;
};

/** yyyy-mm-dd for a date, read in local time rather than UTC. */
export function toDayString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** Parses yyyy-mm-dd as a local calendar day. Returns null for anything else. */
export function parseDayString(value: string | undefined | null): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  // Rejects impossible dates like 2026-02-31, which JS would otherwise roll over.
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return null;
  }
  return date;
}

/** First instant of that local day. */
export function startOfDay(day: string): Date {
  const parsed = parseDayString(day) ?? new Date();
  return new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate(), 0, 0, 0, 0);
}

/** Last instant of that local day, so an inclusive `to` really includes it. */
export function endOfDay(day: string): Date {
  const parsed = parseDayString(day) ?? new Date();
  return new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate(), 23, 59, 59, 999);
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

/**
 * Turns query-string values into a concrete range.
 *
 * An explicit from/to always wins and is reported as `custom`; otherwise the
 * named preset is expanded. An unknown preset falls back to the last 30 days
 * rather than erroring, so a hand-edited URL degrades instead of breaking.
 */
export function resolveRange(
  params: { range?: string; from?: string; to?: string },
  now = new Date(),
): DateRange {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const explicitFrom = parseDayString(params.from);
  const explicitTo = parseDayString(params.to);
  if (explicitFrom || explicitTo) {
    // A half-open range is completed rather than rejected.
    const from = explicitFrom ?? explicitTo!;
    const to = explicitTo ?? explicitFrom!;
    // Swapped dates are corrected rather than returning nothing.
    const ordered = from <= to ? [from, to] : [to, from];
    return { preset: 'custom', from: toDayString(ordered[0]), to: toDayString(ordered[1]) };
  }

  const preset = (RANGE_PRESETS as readonly string[]).includes(params.range ?? '')
    ? (params.range as RangePreset)
    : 'last30';

  switch (preset) {
    case 'today':
      return { preset, from: toDayString(today), to: toDayString(today) };
    case 'yesterday': {
      const day = addDays(today, -1);
      return { preset, from: toDayString(day), to: toDayString(day) };
    }
    case 'last7':
      return { preset, from: toDayString(addDays(today, -6)), to: toDayString(today) };
    case 'thisMonth':
      return {
        preset,
        from: toDayString(new Date(today.getFullYear(), today.getMonth(), 1)),
        to: toDayString(today),
      };
    case 'lastMonth': {
      const first = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      const last = new Date(today.getFullYear(), today.getMonth(), 0);
      return { preset, from: toDayString(first), to: toDayString(last) };
    }
    case 'thisQuarter': {
      const quarterStartMonth = Math.floor(today.getMonth() / 3) * 3;
      return {
        preset,
        from: toDayString(new Date(today.getFullYear(), quarterStartMonth, 1)),
        to: toDayString(today),
      };
    }
    case 'thisYear':
      return {
        preset,
        from: toDayString(new Date(today.getFullYear(), 0, 1)),
        to: toDayString(today),
      };
    case 'custom':
    case 'last30':
    default:
      return {
        preset: preset === 'custom' ? 'last30' : preset,
        from: toDayString(addDays(today, -29)),
        to: toDayString(today),
      };
  }
}

/** Inclusive number of days the range spans. */
export function rangeLengthInDays(range: Pick<DateRange, 'from' | 'to'>): number {
  const from = startOfDay(range.from);
  const to = startOfDay(range.to);
  return Math.round((to.getTime() - from.getTime()) / 86_400_000) + 1;
}

/**
 * The equally long window immediately before this one, for "vs previous
 * period". A 7-day range compares against the 7 days before it, so the
 * comparison is like-for-like rather than against a longer or shorter span.
 */
export function previousRange(range: Pick<DateRange, 'from' | 'to'>): {
  from: string;
  to: string;
} {
  const length = rangeLengthInDays(range);
  const from = startOfDay(range.from);
  return {
    from: toDayString(addDays(from, -length)),
    to: toDayString(addDays(from, -1)),
  };
}

export type Granularity = 'hour' | 'day' | 'week' | 'month';

/**
 * Picks a sensible bucket size so a chart never renders 400 unreadable bars
 * or a single lonely one.
 */
export function chooseGranularity(range: Pick<DateRange, 'from' | 'to'>): Granularity {
  const days = rangeLengthInDays(range);
  if (days <= 1) return 'hour';
  if (days <= 62) return 'day';
  if (days <= 365) return 'week';
  return 'month';
}

const MONTH_NAMES = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const;

/**
 * "01 Sep 2026 – 10 Sep 2026", or a single date when the range is one day.
 *
 * Spelled out rather than delegated to toLocaleDateString: Node's en-GB data
 * renders September as "Sept", and the label would then change under the
 * admin depending on which ICU build the server happens to ship.
 */
export function formatRangeLabel(range: Pick<DateRange, 'from' | 'to'>): string {
  const format = (day: string) => {
    const date = startOfDay(day);
    const dayOfMonth = String(date.getDate()).padStart(2, '0');
    return `${dayOfMonth} ${MONTH_NAMES[date.getMonth()]} ${date.getFullYear()}`;
  };
  return range.from === range.to
    ? format(range.from)
    : `${format(range.from)} – ${format(range.to)}`;
}

/** Percentage change against the previous period, or null when it had none. */
export function percentChange(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? 0 : null;
  return ((current - previous) / previous) * 100;
}
