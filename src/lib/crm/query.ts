import type { Prisma } from '@prisma/client';

/**
 * Every filter the lead list, pipeline and CSV export understand.
 *
 * Each key maps onto a column the Lead model already stores, so nothing here
 * needed a schema change. Filters always combine with AND — choosing
 * "Qualified" and "Google" means leads that are both.
 */
export type LeadFilters = {
  q?: string;
  /**
   * The market the lead came from.
   *
   * Absent means "every market this view is allowed to show" — the lead list
   * resolves the default from the admin's selected market before it gets here,
   * so an empty value is genuinely "all countries", not "unfiltered by
   * accident".
   */
  countryId?: string;
  status?: string;
  assignedTo?: string;
  productId?: string;
  formId?: string;
  pageId?: string;
  /** Last-touch utm_source. */
  source?: string;
  utmMedium?: string;
  utmCampaign?: string;
  utmContent?: string;
  /** The free-text `source` column (e.g. "Contact form"). */
  leadSource?: string;
  /** First page of the visit that converted, as recorded on the lead. */
  landingUrl?: string;
  /** 'due' = follow-up on or before today, 'set' = has one, 'none' = has none. */
  followUp?: string;
  /**
   * Consent state, as the column shows it.
   *
   * 'recorded' | 'none' | 'withdrawn' | 'na' | 'marketing' — the last being
   * "agreed to marketing and has not withdrawn", which is the set a campaign
   * may actually be sent to.
   */
  consent?: string;
  /** Filter dates against creation or last update. */
  dateField?: string;
  from?: string;
  to?: string;
  sort?: string;
  dir?: string;
};

/** End of the given day, so a `to` filter includes everything that day. */
function endOfDay(value: string): Date {
  const date = new Date(value);
  date.setHours(23, 59, 59, 999);
  return date;
}

function endOfToday(): Date {
  const date = new Date();
  date.setHours(23, 59, 59, 999);
  return date;
}

/** Statuses that mean the lead is no longer being worked. */
const CLOSED_STATUSES = ['WON', 'LOST', 'SPAM'] as const;

/** Shared filter builder used by the lead list, the pipeline and the CSV export. */
export function buildLeadWhere(filters: LeadFilters): Prisma.LeadWhereInput {
  const where: Prisma.LeadWhereInput = { deletedAt: null };
  const and: Prisma.LeadWhereInput[] = [];

  if (filters.q?.trim()) {
    const q = filters.q.trim();
    where.OR = [
      { name: { contains: q, mode: 'insensitive' } },
      { email: { contains: q, mode: 'insensitive' } },
      { company: { contains: q, mode: 'insensitive' } },
      { phone: { contains: q, mode: 'insensitive' } },
      { message: { contains: q, mode: 'insensitive' } },
    ];
  }

  if (filters.countryId) where.countryId = filters.countryId;

  if (filters.status) where.status = filters.status as Prisma.LeadWhereInput['status'];

  if (filters.assignedTo === 'unassigned') where.assignedToId = null;
  else if (filters.assignedTo === 'assigned') where.assignedToId = { not: null };
  else if (filters.assignedTo) where.assignedToId = filters.assignedTo;

  if (filters.productId) where.productId = filters.productId;
  if (filters.formId) where.formId = filters.formId;
  if (filters.pageId) where.landingPageId = filters.pageId;

  // The CRM dashboard groups leads with no attribution under "Direct / none".
  // Clicking that row has to mean "the ones with nothing recorded", so the
  // sentinel resolves to IS NULL rather than to a literal value no lead holds.
  applyAttribution(where, 'utmSource', filters.source);
  applyAttribution(where, 'utmMedium', filters.utmMedium);
  applyAttribution(where, 'utmCampaign', filters.utmCampaign);
  applyAttribution(where, 'utmContent', filters.utmContent);
  if (filters.leadSource) where.source = filters.leadSource;
  // Matches the dimension the CRM dashboard's "Top landing pages" groups by,
  // so clicking a bar selects exactly the leads that bar counted.
  if (filters.landingUrl) {
    where.landingUrl = filters.landingUrl === NO_ATTRIBUTION ? null : filters.landingUrl;
  }

  /*
   * Consent filters read the evidence, never a flag copied onto the lead. A
   * denormalised boolean would drift the moment a withdrawal was recorded, and
   * this is the one place where being out of date is a compliance problem
   * rather than a cosmetic one.
   */
  if (filters.consent === 'recorded') {
    and.push({ consents: { some: { enquiryConsent: true, withdrawnAt: null } } });
  } else if (filters.consent === 'none') {
    // No record at all, or a record that was never agreed to. Leads captured
    // before consent evidence existed land here, which is the honest place
    // for them.
    and.push({
      OR: [
        { consents: { none: {} } },
        { consents: { every: { enquiryConsent: false, lawfulBasis: 'CONSENT' } } },
      ],
    });
  } else if (filters.consent === 'withdrawn') {
    and.push({ consents: { some: { withdrawnAt: { not: null } } } });
  } else if (filters.consent === 'na') {
    and.push({ consents: { some: { lawfulBasis: { not: 'CONSENT' } } } });
  } else if (filters.consent === 'marketing') {
    and.push({
      consents: { some: { marketingConsent: true, withdrawnAt: null } },
      marketingSuppressedAt: null,
    });
  }

  if (filters.followUp === 'due') {
    and.push({
      followUpAt: { lte: endOfToday() },
      status: { notIn: [...CLOSED_STATUSES] },
    });
  } else if (filters.followUp === 'set') {
    and.push({ followUpAt: { not: null } });
  } else if (filters.followUp === 'none') {
    and.push({ followUpAt: null });
  } else if (filters.followUp === 'overdue') {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    and.push({
      followUpAt: { lt: startOfToday },
      status: { notIn: [...CLOSED_STATUSES] },
    });
  }

  if (filters.from || filters.to) {
    const range: Prisma.DateTimeFilter = {};
    if (filters.from) range.gte = new Date(filters.from);
    if (filters.to) range.lte = endOfDay(filters.to);
    // "Last activity" uses updatedAt, which every write to a lead touches.
    if (filters.dateField === 'activity') where.updatedAt = range;
    else where.createdAt = range;
  }

  if (and.length > 0) where.AND = and;

  return where;
}

/**
 * Value used in a URL to mean "no campaign recorded". Real UTM values are
 * lowercased slugs, so this cannot collide with one a visitor could arrive on.
 */
export const NO_ATTRIBUTION = 'direct';

function applyAttribution(
  where: Prisma.LeadWhereInput,
  column: 'utmSource' | 'utmMedium' | 'utmCampaign' | 'utmContent',
  value: string | undefined,
): void {
  if (!value) return;
  where[column] = value === NO_ATTRIBUTION ? null : value;
}

export const LEAD_SORT_FIELDS = ['createdAt', 'updatedAt', 'name', 'status', 'value'] as const;
export type LeadSortField = (typeof LEAD_SORT_FIELDS)[number];

/**
 * Translates the sort query params into a Prisma order.
 *
 * Unknown values fall back to newest-first rather than erroring, so a
 * hand-edited URL can never break the page.
 */
export function buildLeadOrderBy(
  filters: Pick<LeadFilters, 'sort' | 'dir'>,
): Prisma.LeadOrderByWithRelationInput {
  const field = (LEAD_SORT_FIELDS as readonly string[]).includes(filters.sort ?? '')
    ? (filters.sort as LeadSortField)
    : 'createdAt';
  const direction: Prisma.SortOrder = filters.dir === 'asc' ? 'asc' : 'desc';
  return { [field]: direction };
}
