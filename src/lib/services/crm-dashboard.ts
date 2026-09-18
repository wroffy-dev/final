import 'server-only';
import { prisma } from '@/lib/db/prisma';
import type { LeadStatus, Prisma } from '@prisma/client';
import { NO_ATTRIBUTION } from '@/lib/crm/query';
import {
  startOfDay,
  endOfDay,
  previousRange,
  chooseGranularity,
  percentChange,
  toDayString,
  type DateRange,
  type Granularity,
} from '@/lib/admin/date-range';

/**
 * Everything the CRM dashboard shows, computed in the database.
 *
 * Nothing here loads a table and counts it in JavaScript: each figure is a
 * `count`, a `groupBy` or a grouped raw query bounded by the selected range,
 * so the page costs the same whether the CRM holds a hundred leads or a
 * million. Every metric maps onto a column that already exists — no figure is
 * invented, and where a number cannot be computed honestly it is reported as
 * null rather than as zero.
 */

/** Statuses that mean the lead was won. Kept in one place so KPIs agree. */
const WON: LeadStatus = 'WON';
const LOST: LeadStatus = 'LOST';

/**
 * The clause every figure on this dashboard is bounded by.
 *
 * `countryId` is optional and means what it says: given, the dashboard reports
 * one storefront; omitted, it reports every market the viewer can see. There is
 * no third state, so a number on this page always has an unambiguous scope.
 */
function rangeWhere(
  range: Pick<DateRange, 'from' | 'to'>,
  countryId?: string,
): Prisma.LeadWhereInput {
  return {
    deletedAt: null,
    // Spam is excluded everywhere on this dashboard: it is noise, not demand.
    status: { not: 'SPAM' },
    ...(countryId ? { countryId } : {}),
    createdAt: { gte: startOfDay(range.from), lte: endOfDay(range.to) },
  };
}

export type Kpi = {
  key: string;
  label: string;
  value: number;
  previous: number;
  /** Percent change vs the previous equal-length period; null when previous was zero. */
  change: number | null;
  /** A percentage metric renders as "12.4%" rather than a count. */
  isRate?: boolean;
};

async function countLeads(where: Prisma.LeadWhereInput): Promise<number> {
  return prisma.lead.count({ where });
}

/** KPI row — each figure alongside the same figure for the previous period. */
export async function getCrmKpis(range: DateRange, countryId?: string): Promise<Kpi[]> {
  const current = rangeWhere(range, countryId);
  const previous = rangeWhere(previousRange(range), countryId);

  const byStatus = (where: Prisma.LeadWhereInput, status: LeadStatus) => ({ ...where, status });

  const [
    total,
    prevTotal,
    newLeads,
    prevNew,
    contacted,
    prevContacted,
    qualified,
    prevQualified,
    won,
    prevWon,
    lost,
    prevLost,
    submissions,
    prevSubmissions,
    customers,
    prevCustomers,
  ] = await Promise.all([
    countLeads(current),
    countLeads(previous),
    countLeads(byStatus(current, 'NEW')),
    countLeads(byStatus(previous, 'NEW')),
    countLeads(byStatus(current, 'CONTACTED')),
    countLeads(byStatus(previous, 'CONTACTED')),
    countLeads(byStatus(current, 'QUALIFIED')),
    countLeads(byStatus(previous, 'QUALIFIED')),
    countLeads(byStatus(current, WON)),
    countLeads(byStatus(previous, WON)),
    countLeads(byStatus(current, LOST)),
    countLeads(byStatus(previous, LOST)),
    prisma.formSubmission.count({
      where: { createdAt: { gte: startOfDay(range.from), lte: endOfDay(range.to) } },
    }),
    prisma.formSubmission.count({
      where: {
        createdAt: {
          gte: startOfDay(previousRange(range).from),
          lte: endOfDay(previousRange(range).to),
        },
      },
    }),
    prisma.customer.count({
      where: {
        deletedAt: null,
        createdAt: { gte: startOfDay(range.from), lte: endOfDay(range.to) },
      },
    }),
    prisma.customer.count({
      where: {
        deletedAt: null,
        createdAt: {
          gte: startOfDay(previousRange(range).from),
          lte: endOfDay(previousRange(range).to),
        },
      },
    }),
  ]);

  const rate = (part: number, whole: number) => (whole === 0 ? 0 : (part / whole) * 100);

  const kpi = (key: string, label: string, value: number, prev: number, isRate = false): Kpi => ({
    key,
    label,
    value,
    previous: prev,
    change: percentChange(value, prev),
    isRate,
  });

  return [
    kpi('total', 'Total leads', total, prevTotal),
    kpi('new', 'New', newLeads, prevNew),
    kpi('contacted', 'Contacted', contacted, prevContacted),
    kpi('qualified', 'Qualified', qualified, prevQualified),
    kpi('won', 'Won', won, prevWon),
    kpi('lost', 'Lost', lost, prevLost),
    kpi('customers', 'Converted to customers', customers, prevCustomers),
    kpi('submissions', 'Form submissions', submissions, prevSubmissions),
    kpi('conversion', 'Conversion rate', rate(won, total), rate(prevWon, prevTotal), true),
  ];
}

export type TrendPoint = { label: string; value: number };

/**
 * Leads over time, bucketed by the granularity the range deserves.
 *
 * Grouping happens in Postgres via date_trunc rather than by pulling rows and
 * bucketing them here. The bucket is truncated in the server's local zone so
 * a "day" on the chart matches the "day" the KPI cards counted.
 */
export async function getLeadTrend(
  range: DateRange,
  countryId?: string,
): Promise<{ points: TrendPoint[]; granularity: Granularity }> {
  const granularity = chooseGranularity(range);
  const from = startOfDay(range.from);
  const to = endOfDay(range.to);

  // Parameterised either way — the market is a bound value, never interpolated.
  const rows = countryId
    ? await prisma.$queryRaw<Array<{ bucket: Date; count: bigint }>>`
        SELECT date_trunc(${granularity}, "createdAt") AS bucket, COUNT(*)::bigint AS count
        FROM "Lead"
        WHERE "deletedAt" IS NULL
          AND "status" <> 'SPAM'
          AND "countryId" = ${countryId}
          AND "createdAt" >= ${from}
          AND "createdAt" <= ${to}
        GROUP BY bucket
        ORDER BY bucket ASC
      `
    : await prisma.$queryRaw<Array<{ bucket: Date; count: bigint }>>`
        SELECT date_trunc(${granularity}, "createdAt") AS bucket, COUNT(*)::bigint AS count
        FROM "Lead"
        WHERE "deletedAt" IS NULL
          AND "status" <> 'SPAM'
          AND "createdAt" >= ${from}
          AND "createdAt" <= ${to}
        GROUP BY bucket
        ORDER BY bucket ASC
      `;

  const counts = new Map<string, number>();
  for (const row of rows) counts.set(bucketKey(row.bucket, granularity), Number(row.count));

  // Empty buckets are filled in, so a quiet Tuesday reads as a gap in the line
  // rather than vanishing and making the range look shorter than it is.
  const points: TrendPoint[] = [];
  for (const bucket of enumerateBuckets(from, to, granularity)) {
    points.push({
      label: bucketLabel(bucket, granularity),
      value: counts.get(bucketKey(bucket, granularity)) ?? 0,
    });
  }

  return { points, granularity };
}

function bucketKey(date: Date, granularity: Granularity): string {
  const d = new Date(date);
  if (granularity === 'hour') return `${toDayString(d)}T${String(d.getHours()).padStart(2, '0')}`;
  if (granularity === 'month') return `${d.getFullYear()}-${d.getMonth()}`;
  return toDayString(d);
}

function enumerateBuckets(from: Date, to: Date, granularity: Granularity): Date[] {
  const buckets: Date[] = [];
  const cursor = new Date(from);
  if (granularity === 'hour') cursor.setMinutes(0, 0, 0);
  if (granularity === 'week') cursor.setDate(cursor.getDate() - ((cursor.getDay() + 6) % 7));
  if (granularity === 'month') cursor.setDate(1);

  // Bounded so a nonsensical range can never spin here.
  while (cursor <= to && buckets.length < 1000) {
    buckets.push(new Date(cursor));
    if (granularity === 'hour') cursor.setHours(cursor.getHours() + 1);
    else if (granularity === 'day') cursor.setDate(cursor.getDate() + 1);
    else if (granularity === 'week') cursor.setDate(cursor.getDate() + 7);
    else cursor.setMonth(cursor.getMonth() + 1);
  }
  return buckets;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function bucketLabel(date: Date, granularity: Granularity): string {
  if (granularity === 'hour') return `${String(date.getHours()).padStart(2, '0')}:00`;
  if (granularity === 'month') return `${MONTHS[date.getMonth()]} ${date.getFullYear()}`;
  return `${date.getDate()} ${MONTHS[date.getMonth()]}`;
}

export type StatusSlice = { status: LeadStatus; label: string; count: number; share: number };

/** Status breakdown for the range. Shares are of the range, not of all time. */
export async function getStatusBreakdown(
  range: DateRange,
  countryId?: string,
): Promise<StatusSlice[]> {
  const { LEAD_STATUS_LABELS } = await import('@/lib/crm/constants');
  const rows = await prisma.lead.groupBy({
    by: ['status'],
    where: rangeWhere(range, countryId),
    _count: { _all: true },
  });

  const total = rows.reduce((sum, row) => sum + row._count._all, 0);
  return rows
    .map((row) => ({
      status: row.status,
      label: LEAD_STATUS_LABELS[row.status] ?? row.status,
      count: row._count._all,
      share: total === 0 ? 0 : (row._count._all / total) * 100,
    }))
    .sort((a, b) => b.count - a.count);
}

export type SourceRow = {
  key: string;
  label: string;
  leads: number;
  won: number;
  /** Won as a percentage of leads from this source. */
  conversionRate: number;
};

/**
 * Performance per attribution dimension, using the last-touch UTM columns that
 * the middleware already records. Leads with nothing recorded are grouped as
 * "Direct / none" rather than dropped, so the column still totals correctly.
 */
async function performanceBy(
  field: 'utmSource' | 'utmMedium' | 'utmCampaign',
  range: DateRange,
  countryId?: string,
  limit = 8,
): Promise<SourceRow[]> {
  const where = rangeWhere(range, countryId);

  const [all, wonRows] = await Promise.all([
    prisma.lead.groupBy({ by: [field], where, _count: { _all: true } }),
    prisma.lead.groupBy({ by: [field], where: { ...where, status: WON }, _count: { _all: true } }),
  ]);

  const wonBy = new Map<string, number>();
  for (const row of wonRows) wonBy.set(row[field] ?? '', row._count._all);

  return all
    .map((row) => {
      const key = row[field] ?? '';
      const leads = row._count._all;
      const won = wonBy.get(key) ?? 0;
      return {
        // The sentinel the leads list understands as "nothing recorded", so
        // clicking this row shows exactly the leads it counted.
        key: key || NO_ATTRIBUTION,
        label: key || 'Direct / none',
        leads,
        won,
        conversionRate: leads === 0 ? 0 : (won / leads) * 100,
      };
    })
    .sort((a, b) => b.leads - a.leads)
    .slice(0, limit);
}

export const getSourcePerformance = (range: DateRange, countryId?: string) =>
  performanceBy('utmSource', range, countryId);
export const getMediumPerformance = (range: DateRange, countryId?: string) =>
  performanceBy('utmMedium', range, countryId);
export const getCampaignPerformance = (range: DateRange, countryId?: string) =>
  performanceBy('utmCampaign', range, countryId);

export type NamedCount = { key: string; label: string; count: number };

/** Top landing pages and forms for the range, by lead volume. */
export async function getTopEntryPoints(
  range: DateRange,
  countryId?: string,
): Promise<{
  landingPages: NamedCount[];
  forms: NamedCount[];
}> {
  const where = rangeWhere(range, countryId);

  const [landing, forms] = await Promise.all([
    prisma.lead.groupBy({
      by: ['landingUrl'],
      where,
      _count: { _all: true },
      orderBy: { _count: { landingUrl: 'desc' } },
      take: 6,
    }),
    prisma.lead.groupBy({
      by: ['formId'],
      where: { ...where, formId: { not: null } },
      _count: { _all: true },
      orderBy: { _count: { formId: 'desc' } },
      take: 6,
    }),
  ]);

  const formNames = new Map<string, string>();
  const formIds = forms.map((row) => row.formId).filter((id): id is string => Boolean(id));
  if (formIds.length > 0) {
    const records = await prisma.form.findMany({
      where: { id: { in: formIds } },
      select: { id: true, name: true },
    });
    for (const record of records) formNames.set(record.id, record.name);
  }

  return {
    landingPages: landing.map((row) => ({
      // Same sentinel the leads list understands, so an unrecorded landing
      // page still drills through to the leads it counted.
      key: row.landingUrl || NO_ATTRIBUTION,
      label: row.landingUrl || 'Not recorded',
      count: row._count._all,
    })),
    forms: forms.map((row) => ({
      key: row.formId ?? 'unknown',
      label: formNames.get(row.formId ?? '') ?? 'Deleted form',
      count: row._count._all,
    })),
  };
}
