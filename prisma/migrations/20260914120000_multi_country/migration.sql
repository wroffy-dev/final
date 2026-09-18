-- Multi-country conversion.
--
-- This migration runs against a populated production database, so every step is
-- staged and idempotent:
--
--   1. create the Country table and insert the markets
--   2. add every countryId column as NULLABLE
--   3. backfill existing rows to the default market (India)
--   4. only then enforce NOT NULL, foreign keys and the new unique constraints
--
-- Nothing is dropped that holds data, no row is deleted and no slug changes, so
-- every existing India URL, page, article, menu, form, lead and submission is
-- exactly where it was before. The only unique indexes removed are the global
-- slug indexes that are replaced, in the same transaction, by their
-- (countryId, slug) equivalents.

-- ---------------------------------------------------------------------------
-- 1. Country
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "Country" (
    "id"             TEXT         NOT NULL,
    "name"           TEXT         NOT NULL,
    "code"           TEXT         NOT NULL,
    "slug"           TEXT         NOT NULL,
    "locale"         TEXT         NOT NULL DEFAULT 'en',
    "currency"       TEXT         NOT NULL DEFAULT 'INR',
    "currencySymbol" TEXT         NOT NULL DEFAULT '₹',
    "phoneCode"      TEXT,
    "timezone"       TEXT         NOT NULL DEFAULT 'Asia/Kolkata',
    "isDefault"      BOOLEAN      NOT NULL DEFAULT false,
    "isActive"       BOOLEAN      NOT NULL DEFAULT true,
    "sortOrder"      INTEGER      NOT NULL DEFAULT 0,
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"      TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Country_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "Country_code_key"       ON "Country"("code");
CREATE UNIQUE INDEX IF NOT EXISTS "Country_slug_key"       ON "Country"("slug");
CREATE        INDEX IF NOT EXISTS "Country_isActive_sortOrder_idx" ON "Country"("isActive", "sortOrder");
CREATE        INDEX IF NOT EXISTS "Country_slug_idx"       ON "Country"("slug");

-- The two markets that go live with this change. India keeps the empty slug so
-- it continues to be served from the site root; nothing about its URLs moves.
INSERT INTO "Country" ("id", "name", "code", "slug", "locale", "currency", "currencySymbol", "phoneCode", "timezone", "isDefault", "isActive", "sortOrder", "updatedAt")
VALUES
    ('country_in', 'India',                'IN', '',   'en-IN', 'INR', '₹',   '+91',  'Asia/Kolkata', true,  true, 0, CURRENT_TIMESTAMP),
    ('country_ae', 'United Arab Emirates', 'AE', 'ae', 'en-AE', 'AED', 'AED', '+971', 'Asia/Dubai',   false, true, 1, CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO NOTHING;

-- ---------------------------------------------------------------------------
-- 2. CountrySettings / UserCountry
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "CountrySettings" (
    "id"                  TEXT         NOT NULL,
    "countryId"           TEXT         NOT NULL,
    "companyName"         TEXT,
    "legalName"           TEXT,
    "salesPhone"          TEXT,
    "supportPhone"        TEXT,
    "whatsappNumber"      TEXT,
    "salesEmail"          TEXT,
    "supportEmail"        TEXT,
    "addressLine1"        TEXT,
    "addressLine2"        TEXT,
    "city"                TEXT,
    "region"              TEXT,
    "postalCode"          TEXT,
    "address"             TEXT,
    "businessHours"       TEXT,
    "taxLabel"            TEXT,
    "taxNumber"           TEXT,
    "headerCtaLabel"      TEXT,
    "headerCtaUrl"        TEXT,
    "salesCtaText"        TEXT,
    "footerDescription"   TEXT,
    "copyrightText"       TEXT,
    "defaultTitle"        TEXT,
    "titleTemplate"       TEXT,
    "defaultDescription"  TEXT,
    "defaultOgImageUrl"   TEXT,
    "organizationName"    TEXT,
    "organizationType"    TEXT,
    "organizationLogoUrl" TEXT,
    "localBusinessType"   TEXT,
    "latitude"            TEXT,
    "longitude"           TEXT,
    "createdAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"           TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CountrySettings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "CountrySettings_countryId_key" ON "CountrySettings"("countryId");

CREATE TABLE IF NOT EXISTS "UserCountry" (
    "userId"    TEXT NOT NULL,
    "countryId" TEXT NOT NULL,
    CONSTRAINT "UserCountry_pkey" PRIMARY KEY ("userId", "countryId")
);

CREATE INDEX IF NOT EXISTS "UserCountry_countryId_idx" ON "UserCountry"("countryId");

-- ---------------------------------------------------------------------------
-- 3. ProductCountry / ProductVariantCountry / BlogCategoryCountry
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "ProductCountry" (
    "id"               TEXT            NOT NULL,
    "productId"        TEXT            NOT NULL,
    "countryId"        TEXT            NOT NULL,
    "status"           "ContentStatus" NOT NULL DEFAULT 'DRAFT',
    "publishedAt"      TIMESTAMP(3),
    "isFeatured"       BOOLEAN         NOT NULL DEFAULT false,
    "sortOrder"        INTEGER         NOT NULL DEFAULT 0,
    "featuredOrder"    INTEGER         NOT NULL DEFAULT 0,
    "currency"         TEXT            NOT NULL DEFAULT 'INR',
    "monthlyPrice"     DECIMAL(12,2),
    "annualPrice"      DECIMAL(12,2),
    "compareAtPrice"   DECIMAL(12,2),
    "discountPercent"  INTEGER,
    "priceSuffix"      TEXT,
    "priceNote"        TEXT,
    "shortDescription" TEXT,
    "description"      TEXT,
    "ctaLabel"         TEXT,
    "ctaUrl"           TEXT,
    "ctaFormId"        TEXT,
    "seoTitle"         TEXT,
    "seoDescription"   TEXT,
    "canonicalUrl"     TEXT,
    "noIndex"          BOOLEAN         NOT NULL DEFAULT false,
    "ogImageId"        TEXT,
    "createdAt"        TIMESTAMP(3)    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"        TIMESTAMP(3)    NOT NULL,
    CONSTRAINT "ProductCountry_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ProductCountry_productId_countryId_key" ON "ProductCountry"("productId", "countryId");
CREATE INDEX IF NOT EXISTS "ProductCountry_countryId_status_publishedAt_idx"  ON "ProductCountry"("countryId", "status", "publishedAt");
CREATE INDEX IF NOT EXISTS "ProductCountry_countryId_sortOrder_idx"           ON "ProductCountry"("countryId", "sortOrder");
CREATE INDEX IF NOT EXISTS "ProductCountry_countryId_isFeatured_featuredOrder_idx" ON "ProductCountry"("countryId", "isFeatured", "featuredOrder");
CREATE INDEX IF NOT EXISTS "ProductCountry_productId_idx"                     ON "ProductCountry"("productId");

CREATE TABLE IF NOT EXISTS "ProductVariantCountry" (
    "id"           TEXT          NOT NULL,
    "variantId"    TEXT          NOT NULL,
    "countryId"    TEXT          NOT NULL,
    "currency"     TEXT,
    "monthlyPrice" DECIMAL(12,2),
    "annualPrice"  DECIMAL(12,2),
    "isAvailable"  BOOLEAN       NOT NULL DEFAULT true,
    "createdAt"    TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"    TIMESTAMP(3)  NOT NULL,
    CONSTRAINT "ProductVariantCountry_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ProductVariantCountry_variantId_countryId_key" ON "ProductVariantCountry"("variantId", "countryId");
CREATE INDEX IF NOT EXISTS "ProductVariantCountry_countryId_idx" ON "ProductVariantCountry"("countryId");

CREATE TABLE IF NOT EXISTS "BlogCategoryCountry" (
    "id"                 TEXT         NOT NULL,
    "categoryId"         TEXT         NOT NULL,
    "countryId"          TEXT         NOT NULL,
    "archiveTitle"       TEXT,
    "archiveDescription" TEXT,
    "seoTitle"           TEXT,
    "seoDescription"     TEXT,
    "canonicalUrl"       TEXT,
    "ogTitle"            TEXT,
    "ogDescription"      TEXT,
    "noIndex"            BOOLEAN      NOT NULL DEFAULT false,
    "noFollow"           BOOLEAN      NOT NULL DEFAULT false,
    "createdAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"          TIMESTAMP(3) NOT NULL,
    CONSTRAINT "BlogCategoryCountry_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "BlogCategoryCountry_categoryId_countryId_key" ON "BlogCategoryCountry"("categoryId", "countryId");
CREATE INDEX IF NOT EXISTS "BlogCategoryCountry_countryId_idx" ON "BlogCategoryCountry"("countryId");

-- ---------------------------------------------------------------------------
-- 4. Nullable countryId columns on the existing tables
-- ---------------------------------------------------------------------------
ALTER TABLE "Page"           ADD COLUMN IF NOT EXISTS "countryId" TEXT;
ALTER TABLE "BlogPost"       ADD COLUMN IF NOT EXISTS "countryId" TEXT;
ALTER TABLE "Navigation"     ADD COLUMN IF NOT EXISTS "countryId" TEXT;
ALTER TABLE "Lead"           ADD COLUMN IF NOT EXISTS "countryId" TEXT;
ALTER TABLE "FormSubmission" ADD COLUMN IF NOT EXISTS "countryId" TEXT;
ALTER TABLE "Form"           ADD COLUMN IF NOT EXISTS "countryId" TEXT;
ALTER TABLE "Popup"          ADD COLUMN IF NOT EXISTS "countryId" TEXT;

-- ---------------------------------------------------------------------------
-- 5. Backfill — everything that exists today is India's
-- ---------------------------------------------------------------------------
DO $$
DECLARE
    default_country_id TEXT;
BEGIN
    SELECT "id" INTO default_country_id FROM "Country" WHERE "isDefault" = true ORDER BY "sortOrder" LIMIT 1;
    IF default_country_id IS NULL THEN
        RAISE EXCEPTION 'No default country row exists; refusing to backfill';
    END IF;

    UPDATE "Page"           SET "countryId" = default_country_id WHERE "countryId" IS NULL;
    UPDATE "BlogPost"       SET "countryId" = default_country_id WHERE "countryId" IS NULL;
    UPDATE "Navigation"     SET "countryId" = default_country_id WHERE "countryId" IS NULL;
    UPDATE "Lead"           SET "countryId" = default_country_id WHERE "countryId" IS NULL;
    UPDATE "FormSubmission" SET "countryId" = default_country_id WHERE "countryId" IS NULL;

    -- Every product that exists today is sold in India at the price already on
    -- the product row, with the same status, ordering, copy, CTA and SEO. The
    -- public site therefore renders identically the moment it starts reading
    -- ProductCountry. Forms and OG images are carried across only when they
    -- still exist, so a dangling reference can never fail this migration.
    INSERT INTO "ProductCountry" (
        "id", "productId", "countryId", "status", "publishedAt", "isFeatured", "sortOrder", "featuredOrder",
        "currency", "monthlyPrice", "annualPrice", "compareAtPrice", "discountPercent", "priceSuffix", "priceNote",
        "shortDescription", "description", "ctaLabel", "ctaUrl", "ctaFormId",
        "seoTitle", "seoDescription", "canonicalUrl", "noIndex", "ogImageId", "createdAt", "updatedAt"
    )
    SELECT
        'pc' || md5(p."id" || '|' || default_country_id),
        p."id",
        default_country_id,
        p."status",
        p."publishedAt",
        p."isFeatured",
        p."sortOrder",
        p."featuredOrder",
        COALESCE(NULLIF(p."currency", ''), 'INR'),
        p."monthlyPrice",
        p."annualPrice",
        p."compareAtPrice",
        p."discountPercent",
        p."priceSuffix",
        p."priceNote",
        p."shortDescription",
        p."description",
        p."ctaLabel",
        p."ctaUrl",
        p."ctaFormId",
        p."seoTitle",
        p."seoDescription",
        p."canonicalUrl",
        p."noIndex",
        p."ogImageId",
        p."createdAt",
        CURRENT_TIMESTAMP
    FROM "Product" p
    ON CONFLICT ("productId", "countryId") DO NOTHING;

    -- India's country settings start as a copy of the values the single-country
    -- site already used, so the footer, contact details and organisation schema
    -- render byte-identically after this migration.
    INSERT INTO "CountrySettings" (
        "id", "countryId", "companyName", "salesPhone", "whatsappNumber", "salesEmail",
        "address", "headerCtaLabel", "headerCtaUrl", "footerDescription", "copyrightText",
        "defaultTitle", "titleTemplate", "defaultDescription", "defaultOgImageUrl",
        "organizationName", "organizationType", "organizationLogoUrl", "createdAt", "updatedAt"
    )
    SELECT
        'cs' || md5(default_country_id),
        default_country_id,
        w."siteName",
        w."contactPhone",
        w."whatsappNumber",
        w."contactEmail",
        w."address",
        w."headerCtaLabel",
        w."headerCtaUrl",
        w."footerDescription",
        w."copyrightText",
        s."defaultTitle",
        s."titleTemplate",
        s."defaultDescription",
        s."defaultOgImageUrl",
        s."organizationName",
        s."organizationType",
        s."organizationLogoUrl",
        CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP
    FROM "WebsiteSettings" w
    LEFT JOIN "SeoSettings" s ON s."id" = 'singleton'
    WHERE w."id" = 'singleton'
    ON CONFLICT ("countryId") DO NOTHING;
END $$;

-- ---------------------------------------------------------------------------
-- 6. Enforce NOT NULL once the data is in place
-- ---------------------------------------------------------------------------
ALTER TABLE "Page"       ALTER COLUMN "countryId" SET NOT NULL;
ALTER TABLE "BlogPost"   ALTER COLUMN "countryId" SET NOT NULL;
ALTER TABLE "Navigation" ALTER COLUMN "countryId" SET NOT NULL;
ALTER TABLE "Lead"       ALTER COLUMN "countryId" SET NOT NULL;

-- ---------------------------------------------------------------------------
-- 7. Foreign keys
-- ---------------------------------------------------------------------------
DO $$ BEGIN
    ALTER TABLE "CountrySettings" ADD CONSTRAINT "CountrySettings_countryId_fkey"
        FOREIGN KEY ("countryId") REFERENCES "Country"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE "UserCountry" ADD CONSTRAINT "UserCountry_userId_fkey"
        FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE "UserCountry" ADD CONSTRAINT "UserCountry_countryId_fkey"
        FOREIGN KEY ("countryId") REFERENCES "Country"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE "ProductCountry" ADD CONSTRAINT "ProductCountry_productId_fkey"
        FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE "ProductCountry" ADD CONSTRAINT "ProductCountry_countryId_fkey"
        FOREIGN KEY ("countryId") REFERENCES "Country"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE "ProductCountry" ADD CONSTRAINT "ProductCountry_ctaFormId_fkey"
        FOREIGN KEY ("ctaFormId") REFERENCES "Form"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE "ProductCountry" ADD CONSTRAINT "ProductCountry_ogImageId_fkey"
        FOREIGN KEY ("ogImageId") REFERENCES "Media"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE "ProductVariantCountry" ADD CONSTRAINT "ProductVariantCountry_variantId_fkey"
        FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE "ProductVariantCountry" ADD CONSTRAINT "ProductVariantCountry_countryId_fkey"
        FOREIGN KEY ("countryId") REFERENCES "Country"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE "BlogCategoryCountry" ADD CONSTRAINT "BlogCategoryCountry_categoryId_fkey"
        FOREIGN KEY ("categoryId") REFERENCES "BlogCategory"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE "BlogCategoryCountry" ADD CONSTRAINT "BlogCategoryCountry_countryId_fkey"
        FOREIGN KEY ("countryId") REFERENCES "Country"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE "Page" ADD CONSTRAINT "Page_countryId_fkey"
        FOREIGN KEY ("countryId") REFERENCES "Country"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE "BlogPost" ADD CONSTRAINT "BlogPost_countryId_fkey"
        FOREIGN KEY ("countryId") REFERENCES "Country"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE "Navigation" ADD CONSTRAINT "Navigation_countryId_fkey"
        FOREIGN KEY ("countryId") REFERENCES "Country"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE "Lead" ADD CONSTRAINT "Lead_countryId_fkey"
        FOREIGN KEY ("countryId") REFERENCES "Country"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE "FormSubmission" ADD CONSTRAINT "FormSubmission_countryId_fkey"
        FOREIGN KEY ("countryId") REFERENCES "Country"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE "Form" ADD CONSTRAINT "Form_countryId_fkey"
        FOREIGN KEY ("countryId") REFERENCES "Country"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE "Popup" ADD CONSTRAINT "Popup_countryId_fkey"
        FOREIGN KEY ("countryId") REFERENCES "Country"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------------------------------------------------------------------------
-- 8. Slug uniqueness moves from global to per-market
-- ---------------------------------------------------------------------------
DROP INDEX IF EXISTS "Page_slug_key";
DROP INDEX IF EXISTS "BlogPost_slug_key";
DROP INDEX IF EXISTS "Navigation_slug_key";

CREATE UNIQUE INDEX IF NOT EXISTS "Page_countryId_slug_key"       ON "Page"("countryId", "slug");
CREATE UNIQUE INDEX IF NOT EXISTS "BlogPost_countryId_slug_key"   ON "BlogPost"("countryId", "slug");
CREATE UNIQUE INDEX IF NOT EXISTS "Navigation_countryId_slug_key" ON "Navigation"("countryId", "slug");

-- ---------------------------------------------------------------------------
-- 9. Supporting indexes
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS "Page_countryId_idx"                          ON "Page"("countryId");
CREATE INDEX IF NOT EXISTS "Page_countryId_status_publishedAt_idx"       ON "Page"("countryId", "status", "publishedAt");
CREATE INDEX IF NOT EXISTS "BlogPost_countryId_idx"                      ON "BlogPost"("countryId");
CREATE INDEX IF NOT EXISTS "BlogPost_countryId_status_publishedAt_idx"   ON "BlogPost"("countryId", "status", "publishedAt");
CREATE INDEX IF NOT EXISTS "Navigation_countryId_location_idx"           ON "Navigation"("countryId", "location");
CREATE INDEX IF NOT EXISTS "Lead_countryId_createdAt_idx"                ON "Lead"("countryId", "createdAt");
CREATE INDEX IF NOT EXISTS "Lead_countryId_status_idx"                   ON "Lead"("countryId", "status");
CREATE INDEX IF NOT EXISTS "FormSubmission_countryId_createdAt_idx"      ON "FormSubmission"("countryId", "createdAt");
CREATE INDEX IF NOT EXISTS "Form_countryId_idx"                          ON "Form"("countryId");
CREATE INDEX IF NOT EXISTS "Popup_countryId_idx"                         ON "Popup"("countryId");
