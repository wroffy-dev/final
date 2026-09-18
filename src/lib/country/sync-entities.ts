/**
 * The sync's shared vocabulary: what it can touch, and what it reports.
 *
 * Deliberately free of `server-only` and of any database import, because the
 * admin panel renders these counts and labels in the browser. The engine in
 * `sync.ts` is server-only and re-exports everything here, so there is still one
 * list of entities and one set of labels — importing the engine from a client
 * component would drag Prisma into the browser bundle, which is what this file
 * exists to prevent.
 */

/**
 * The only things the sync ever writes into a destination market.
 *
 * Ordered by dependency: a page can point at a category, a product at a brand
 * and a page section at a form, so the things that are pointed *at* are made
 * available first.
 */
export const SYNC_ENTITIES = [
  'PAGE_CATEGORY',
  'PRODUCT_CATEGORY',
  'BRAND',
  'FORM',
  'PRODUCT',
  'PAGE',
  'PAGE_SECTION',
  'NAVIGATION',
  'POPUP',
] as const;

export type SyncEntity = (typeof SYNC_ENTITIES)[number];

/** How an administrator reads each entity kind. */
export const SYNC_ENTITY_LABELS: Record<SyncEntity, string> = {
  PAGE_CATEGORY: 'Page categories',
  PRODUCT_CATEGORY: 'Product categories',
  BRAND: 'Brands',
  FORM: 'Forms',
  PRODUCT: 'Products',
  PAGE: 'Pages',
  PAGE_SECTION: 'Page sections',
  NAVIGATION: 'Menus',
  POPUP: 'Popups',
};

/**
 * What happened to one item.
 *
 * There is no `updated`: the sync never updates anything. `deleted-locally` is
 * its own outcome rather than a kind of skip, because "this market removed it
 * on purpose and we respected that" is the single most important thing an
 * administrator can read on this screen.
 */
export type SyncOutcome = 'created' | 'skipped' | 'deleted-locally' | 'conflict' | 'failed';

export type SyncLogEntry = {
  entity: SyncEntity;
  outcome: SyncOutcome;
  /** What the row is, in words an administrator recognises. */
  label: string;
  sourceId: string;
  targetId?: string;
  /** Why it was skipped, or what needs a human. */
  note?: string;
  /** Country-specific values the copy could not carry across. */
  localise?: string[];
};

/** Per-entity counts, so the screen can say "14 pages" rather than "14 things". */
export type SyncBreakdown = Record<
  SyncEntity,
  { created: number; skipped: number; deletedLocally: number; conflicts: number; failed: number }
>;

export type SyncResult = {
  created: number;
  /** Kept for the stored run record; an add-only sync never updates anything. */
  updated: number;
  skipped: number;
  /** Previously imported, removed here on purpose, and left removed. */
  deletedLocally: number;
  conflicts: number;
  failed: number;
  breakdown: SyncBreakdown;
  log: SyncLogEntry[];
};

export function emptyBreakdown(): SyncBreakdown {
  return Object.fromEntries(
    SYNC_ENTITIES.map((entity) => [
      entity,
      { created: 0, skipped: 0, deletedLocally: 0, conflicts: 0, failed: 0 },
    ]),
  ) as SyncBreakdown;
}
