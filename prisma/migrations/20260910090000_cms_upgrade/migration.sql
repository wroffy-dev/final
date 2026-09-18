-- CMS upgrade: brands, product ordering, extra form field types, global design tokens.
-- Every statement is additive. No column is dropped and no row is deleted, so existing
-- pages, sections, products, forms, leads, media and SEO data survive untouched.

-- ---------------------------------------------------------------------------
-- Form field types
-- ---------------------------------------------------------------------------
ALTER TYPE "FormFieldType" ADD VALUE IF NOT EXISTS 'URL';
ALTER TYPE "FormFieldType" ADD VALUE IF NOT EXISTS 'DATE';
ALTER TYPE "FormFieldType" ADD VALUE IF NOT EXISTS 'CONSENT';

-- ---------------------------------------------------------------------------
-- Brands
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "Brand" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "websiteUrl" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "logoId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Brand_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "Brand_slug_key" ON "Brand"("slug");
CREATE INDEX IF NOT EXISTS "Brand_slug_idx" ON "Brand"("slug");
CREATE INDEX IF NOT EXISTS "Brand_sortOrder_idx" ON "Brand"("sortOrder");

DO $$ BEGIN
  ALTER TABLE "Brand" ADD CONSTRAINT "Brand_logoId_fkey"
    FOREIGN KEY ("logoId") REFERENCES "Media"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------------------------------------------------------------------------
-- Product: manual featured ordering + brand
-- ---------------------------------------------------------------------------
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "featuredOrder" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "brandId" TEXT;

DO $$ BEGIN
  ALTER TABLE "Product" ADD CONSTRAINT "Product_brandId_fkey"
    FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "Product_brandId_idx" ON "Product"("brandId");
CREATE INDEX IF NOT EXISTS "Product_isFeatured_featuredOrder_idx" ON "Product"("isFeatured", "featuredOrder");
CREATE INDEX IF NOT EXISTS "Product_sortOrder_idx" ON "Product"("sortOrder");
DROP INDEX IF EXISTS "Product_isFeatured_idx";

-- Seed featured ordering from the existing catalogue order so the current
-- front-end order is preserved on first deploy.
UPDATE "Product" SET "featuredOrder" = "sortOrder" WHERE "isFeatured" = true AND "featuredOrder" = 0;

-- ---------------------------------------------------------------------------
-- WebsiteSettings: typography roles, responsive type, layout and button tokens
-- ---------------------------------------------------------------------------
ALTER TABLE "WebsiteSettings" ADD COLUMN IF NOT EXISTS "navFont" TEXT NOT NULL DEFAULT '';
ALTER TABLE "WebsiteSettings" ADD COLUMN IF NOT EXISTS "buttonFont" TEXT NOT NULL DEFAULT '';
ALTER TABLE "WebsiteSettings" ADD COLUMN IF NOT EXISTS "navWeight" TEXT NOT NULL DEFAULT '500';
ALTER TABLE "WebsiteSettings" ADD COLUMN IF NOT EXISTS "buttonWeight" TEXT NOT NULL DEFAULT '600';
ALTER TABLE "WebsiteSettings" ADD COLUMN IF NOT EXISTS "baseFontSizeTablet" TEXT NOT NULL DEFAULT '';
ALTER TABLE "WebsiteSettings" ADD COLUMN IF NOT EXISTS "baseFontSizeMobile" TEXT NOT NULL DEFAULT '';
ALTER TABLE "WebsiteSettings" ADD COLUMN IF NOT EXISTS "headingLineHeight" TEXT NOT NULL DEFAULT '1.15';
ALTER TABLE "WebsiteSettings" ADD COLUMN IF NOT EXISTS "bodyLineHeight" TEXT NOT NULL DEFAULT '1.6';
ALTER TABLE "WebsiteSettings" ADD COLUMN IF NOT EXISTS "headingLetterSpacing" TEXT NOT NULL DEFAULT '-0.02em';
ALTER TABLE "WebsiteSettings" ADD COLUMN IF NOT EXISTS "bodyLetterSpacing" TEXT NOT NULL DEFAULT '0em';
ALTER TABLE "WebsiteSettings" ADD COLUMN IF NOT EXISTS "navFontSize" TEXT NOT NULL DEFAULT '0.9375rem';
ALTER TABLE "WebsiteSettings" ADD COLUMN IF NOT EXISTS "buttonFontSize" TEXT NOT NULL DEFAULT '0.875rem';
ALTER TABLE "WebsiteSettings" ADD COLUMN IF NOT EXISTS "headingScale" TEXT NOT NULL DEFAULT '1';
ALTER TABLE "WebsiteSettings" ADD COLUMN IF NOT EXISTS "headingScaleTablet" TEXT NOT NULL DEFAULT '';
ALTER TABLE "WebsiteSettings" ADD COLUMN IF NOT EXISTS "headingScaleMobile" TEXT NOT NULL DEFAULT '';

ALTER TABLE "WebsiteSettings" ADD COLUMN IF NOT EXISTS "containerWidth" TEXT NOT NULL DEFAULT '72rem';
ALTER TABLE "WebsiteSettings" ADD COLUMN IF NOT EXISTS "containerPadding" TEXT NOT NULL DEFAULT '1.5rem';
ALTER TABLE "WebsiteSettings" ADD COLUMN IF NOT EXISTS "sectionSpacing" TEXT NOT NULL DEFAULT '5rem';
ALTER TABLE "WebsiteSettings" ADD COLUMN IF NOT EXISTS "sectionSpacingMobile" TEXT NOT NULL DEFAULT '3rem';
ALTER TABLE "WebsiteSettings" ADD COLUMN IF NOT EXISTS "borderRadius" TEXT NOT NULL DEFAULT '0.75rem';
ALTER TABLE "WebsiteSettings" ADD COLUMN IF NOT EXISTS "cardRadius" TEXT NOT NULL DEFAULT '1rem';

ALTER TABLE "WebsiteSettings" ADD COLUMN IF NOT EXISTS "buttonRadius" TEXT NOT NULL DEFAULT '0.5rem';
ALTER TABLE "WebsiteSettings" ADD COLUMN IF NOT EXISTS "buttonPaddingX" TEXT NOT NULL DEFAULT '1.25rem';
ALTER TABLE "WebsiteSettings" ADD COLUMN IF NOT EXISTS "buttonPaddingY" TEXT NOT NULL DEFAULT '0.625rem';
ALTER TABLE "WebsiteSettings" ADD COLUMN IF NOT EXISTS "buttonPrimaryStyle" TEXT NOT NULL DEFAULT 'solid';
ALTER TABLE "WebsiteSettings" ADD COLUMN IF NOT EXISTS "buttonSecondaryStyle" TEXT NOT NULL DEFAULT 'outline';
ALTER TABLE "WebsiteSettings" ADD COLUMN IF NOT EXISTS "buttonTextTransform" TEXT NOT NULL DEFAULT 'none';
