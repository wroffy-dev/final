import 'server-only';
import { prisma } from '@/lib/db/prisma';
import type { Prisma } from '@prisma/client';

/**
 * Which markets offer a shared taxonomy row.
 *
 * Product categories, page categories and brands are **one row each**. "Cloud
 * storage" means the same thing in every market, and a brand is one identity —
 * duplicating them per market would mean renaming the same thing five times and
 * would break every product that points at one.
 *
 * What is per-market is whether a market *offers* it. That lives in the three
 * join tables this module drives, and it is the whole reason removing a category
 * from the UAE no longer removes it from India: the removal deletes one row
 * here, not the taxonomy everyone shares.
 *
 * `BlogCategoryCountry` established this shape before these tables existed;
 * they follow it deliberately rather than inventing a second convention.
 */

/** The three taxonomies that are shared globally and offered per market. */
export type AvailabilityKind = 'PRODUCT_CATEGORY' | 'PAGE_CATEGORY' | 'BRAND';

/**
 * What a country-scoped removal did.
 *
 * `retired` is true only when that was the last market offering it, which is
 * the one case where the shared row itself is also worth removing — otherwise
 * the taxonomy is left exactly as it is for everybody else.
 */
export type RemovalOutcome = {
  removed: boolean;
  retired: boolean;
  /** How many markets still offer it after the removal. */
  remaining: number;
};

/** The join table for one taxonomy, as the operations below need it. */
type Delegate = {
  findUnique: (args: { where: Record<string, unknown>; select: { id: true } }) => Promise<{ id: string } | null>;
  deleteMany: (args: { where: Record<string, unknown> }) => Promise<{ count: number }>;
  count: (args: { where: Record<string, unknown> }) => Promise<number>;
  createMany: (args: { data: unknown[]; skipDuplicates: true }) => Promise<{ count: number }>;
  findMany: (args: {
    where: Record<string, unknown>;
    select: Record<string, boolean>;
  }) => Promise<Array<Record<string, unknown>>>;
};

type Spec = {
  /** The Prisma delegate for the join table. */
  table: (client: Prisma.TransactionClient | typeof prisma) => Delegate;
  /** The foreign key naming the taxonomy row. */
  key: 'categoryId' | 'brandId';
  /** The compound-unique argument name Prisma generates. */
  unique: string;
};

const SPECS: Record<AvailabilityKind, Spec> = {
  PRODUCT_CATEGORY: {
    table: (client) => client.productCategoryCountry as unknown as Delegate,
    key: 'categoryId',
    unique: 'categoryId_countryId',
  },
  PAGE_CATEGORY: {
    table: (client) => client.pageCategoryCountry as unknown as Delegate,
    key: 'categoryId',
    unique: 'categoryId_countryId',
  },
  BRAND: {
    table: (client) => client.brandCountry as unknown as Delegate,
    key: 'brandId',
    unique: 'brandId_countryId',
  },
};

/** Does this market offer it? */
export async function isOfferedIn(
  kind: AvailabilityKind,
  entityId: string,
  countryId: string,
): Promise<boolean> {
  const spec = SPECS[kind];
  const row = await spec.table(prisma).findUnique({
    where: { [spec.unique]: { [spec.key]: entityId, countryId } },
    select: { id: true },
  });
  return row !== null;
}

/** The ids of everything this market offers, for a list screen or a picker. */
export async function offeredIn(kind: AvailabilityKind, countryId: string): Promise<string[]> {
  const spec = SPECS[kind];
  const rows = await spec.table(prisma).findMany({
    where: { countryId, isActive: true },
    select: { [spec.key]: true },
  });
  return rows.map((row) => String(row[spec.key]));
}

/**
 * Offers it in a market. Idempotent, so a repeated sync adds nothing.
 *
 * Takes a transaction client where the caller has one, so granting availability
 * can ride along with whatever created the thing being made available.
 */
export async function offerIn(
  kind: AvailabilityKind,
  entityIds: readonly string[],
  countryId: string,
  client: Prisma.TransactionClient | typeof prisma = prisma,
): Promise<number> {
  if (entityIds.length === 0) return 0;
  const spec = SPECS[kind];
  const result = await spec.table(client).createMany({
    data: entityIds.map((entityId) => ({ [spec.key]: entityId, countryId })),
    skipDuplicates: true,
  });
  return result.count;
}

/**
 * Stops one market offering it.
 *
 * This is what "delete" means on a country-scoped taxonomy screen. The shared
 * row is only removed when no market offers it any more — and even then only if
 * the caller asks, because a taxonomy nobody currently offers is still a
 * taxonomy somebody may want back.
 */
export async function removeFrom(
  kind: AvailabilityKind,
  entityId: string,
  countryId: string,
  options: { retireWhenUnused?: (tx: Prisma.TransactionClient) => Promise<void> } = {},
): Promise<RemovalOutcome> {
  const spec = SPECS[kind];

  return prisma.$transaction(async (tx) => {
    const deleted = await spec.table(tx).deleteMany({
      where: { [spec.key]: entityId, countryId },
    });
    const remaining = await spec.table(tx).count({ where: { [spec.key]: entityId } });

    let retired = false;
    if (remaining === 0 && options.retireWhenUnused) {
      await options.retireWhenUnused(tx);
      retired = true;
    }

    return { removed: deleted.count > 0, retired, remaining };
  });
}
