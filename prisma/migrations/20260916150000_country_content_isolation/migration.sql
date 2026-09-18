-- Country isolation for shared content, and a tombstone the sync can trust.
--
-- Additive only. Every new column is nullable or defaulted, and the backfill
-- grants each existing market exactly what it can see today — so the admin
-- screens and the public site look identical the moment this lands, and only
-- start diverging when somebody removes something from one market.

-- ---------------------------------------------------------------------------
-- 1. A product can be withdrawn from one market without being deleted
-- ---------------------------------------------------------------------------
-- The market's prices, ordering and SEO are kept rather than destroyed: a
-- country-scoped delete is a withdrawal from one storefront, not a deletion of
-- the product.
ALTER TABLE "ProductCountry" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);

-- Live rows are the ones the storefront and admin read, so they get their own
-- index rather than filtering a market's whole catalogue every time.
CREATE INDEX IF NOT EXISTS "ProductCountry_countryId_deletedAt_idx"
  ON "ProductCountry" ("countryId", "deletedAt");

-- ---------------------------------------------------------------------------
-- 2. The sync tombstone
-- ---------------------------------------------------------------------------
-- Set when a previously imported copy is found to be gone. This table has no
-- foreign key to the row it points at, which is what lets the record outlive
-- the deletion — and that is the whole point: without it the next run sees
-- "missing" and puts the item back, undoing a deliberate removal every time.
ALTER TABLE "CountrySyncMapping" ADD COLUMN IF NOT EXISTS "deletedInTargetAt" TIMESTAMP(3);

-- ---------------------------------------------------------------------------
-- 3. Country availability for the shared taxonomies
-- ---------------------------------------------------------------------------
-- The taxonomy row stays global — "Cloud storage" means the same thing in every
-- market, and duplicating it per market would mean renaming it five times.
-- What is per-market is whether a market offers it, which is these tables.
CREATE TABLE IF NOT EXISTS "ProductCategoryCountry" (
    "id"         TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "countryId"  TEXT NOT NULL,
    "isActive"   BOOLEAN NOT NULL DEFAULT true,
    "sortOrder"  INTEGER NOT NULL DEFAULT 0,
    "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"  TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ProductCategoryCountry_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "PageCategoryCountry" (
    "id"         TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "countryId"  TEXT NOT NULL,
    "isActive"   BOOLEAN NOT NULL DEFAULT true,
    "sortOrder"  INTEGER NOT NULL DEFAULT 0,
    "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"  TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PageCategoryCountry_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "BrandCountry" (
    "id"        TEXT NOT NULL,
    "brandId"   TEXT NOT NULL,
    "countryId" TEXT NOT NULL,
    "isActive"  BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "BrandCountry_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ProductCategoryCountry_categoryId_countryId_key"
  ON "ProductCategoryCountry" ("categoryId", "countryId");
CREATE INDEX IF NOT EXISTS "ProductCategoryCountry_countryId_isActive_idx"
  ON "ProductCategoryCountry" ("countryId", "isActive");

CREATE UNIQUE INDEX IF NOT EXISTS "PageCategoryCountry_categoryId_countryId_key"
  ON "PageCategoryCountry" ("categoryId", "countryId");
CREATE INDEX IF NOT EXISTS "PageCategoryCountry_countryId_isActive_idx"
  ON "PageCategoryCountry" ("countryId", "isActive");

CREATE UNIQUE INDEX IF NOT EXISTS "BrandCountry_brandId_countryId_key"
  ON "BrandCountry" ("brandId", "countryId");
CREATE INDEX IF NOT EXISTS "BrandCountry_countryId_isActive_idx"
  ON "BrandCountry" ("countryId", "isActive");

DO $$ BEGIN
  ALTER TABLE "ProductCategoryCountry"
    ADD CONSTRAINT "ProductCategoryCountry_categoryId_fkey"
    FOREIGN KEY ("categoryId") REFERENCES "ProductCategory"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "ProductCategoryCountry"
    ADD CONSTRAINT "ProductCategoryCountry_countryId_fkey"
    FOREIGN KEY ("countryId") REFERENCES "Country"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "PageCategoryCountry"
    ADD CONSTRAINT "PageCategoryCountry_categoryId_fkey"
    FOREIGN KEY ("categoryId") REFERENCES "PageCategory"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "PageCategoryCountry"
    ADD CONSTRAINT "PageCategoryCountry_countryId_fkey"
    FOREIGN KEY ("countryId") REFERENCES "Country"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "BrandCountry"
    ADD CONSTRAINT "BrandCountry_brandId_fkey"
    FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "BrandCountry"
    ADD CONSTRAINT "BrandCountry_countryId_fkey"
    FOREIGN KEY ("countryId") REFERENCES "Country"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------------------------------------------------------------------------
-- 4. Backfill: every market keeps exactly what it can see today
-- ---------------------------------------------------------------------------
-- Before this migration the taxonomies were global, so every market saw every
-- category and brand. Granting that same availability to every existing market
-- is what makes this change invisible on the day it lands: nothing appears,
-- nothing disappears, and markets only diverge once somebody removes something.
--
-- ON CONFLICT DO NOTHING makes the whole migration safe to re-run.
INSERT INTO "ProductCategoryCountry" ("id", "categoryId", "countryId", "isActive", "sortOrder", "createdAt", "updatedAt")
SELECT
  'pcc_' || substr(md5(c."id" || ':' || co."id"), 1, 21),
  c."id", co."id", true, c."sortOrder", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "ProductCategory" c CROSS JOIN "Country" co
ON CONFLICT ("categoryId", "countryId") DO NOTHING;

INSERT INTO "PageCategoryCountry" ("id", "categoryId", "countryId", "isActive", "sortOrder", "createdAt", "updatedAt")
SELECT
  'gcc_' || substr(md5(c."id" || ':' || co."id"), 1, 21),
  c."id", co."id", true, c."sortOrder", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "PageCategory" c CROSS JOIN "Country" co
ON CONFLICT ("categoryId", "countryId") DO NOTHING;

INSERT INTO "BrandCountry" ("id", "brandId", "countryId", "isActive", "sortOrder", "createdAt", "updatedAt")
SELECT
  'brc_' || substr(md5(b."id" || ':' || co."id"), 1, 21),
  b."id", co."id", true, b."sortOrder", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Brand" b CROSS JOIN "Country" co
ON CONFLICT ("brandId", "countryId") DO NOTHING;

-- ---------------------------------------------------------------------------
-- 5. Carry forward products already deleted globally
-- ---------------------------------------------------------------------------
-- A product deleted before this release was deleted everywhere, because that
-- was the only kind of delete there was. Its market configurations are marked
-- deleted to match, so the change of meaning does not silently bring products
-- back into storefronts that had removed them.
UPDATE "ProductCountry" pc
SET "deletedAt" = p."deletedAt"
FROM "Product" p
WHERE pc."productId" = p."id"
  AND p."deletedAt" IS NOT NULL
  AND pc."deletedAt" IS NULL;
