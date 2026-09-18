-- Blog CMS system: reorderable listing/article sections, a modular sidebar,
-- blog design settings and the per-post display controls behind them.
--
-- Every statement is additive and idempotent. No column is dropped, no table is
-- replaced and no row is rewritten, so existing posts, categories, tags, media
-- and leads survive this migration untouched. New columns are nullable or
-- carry a default that reproduces today's behaviour exactly.

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
DO $$ BEGIN
    CREATE TYPE "BlogSurface" AS ENUM ('LISTING', 'ARTICLE', 'SIDEBAR');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE "BlogSidebarMode" AS ENUM ('GLOBAL', 'CUSTOM', 'NONE');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------------------------------------------------------------------------
-- User — public author profile links
-- ---------------------------------------------------------------------------
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "linkedinUrl" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "twitterUrl"  TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "websiteUrl"  TEXT;

-- ---------------------------------------------------------------------------
-- BlogCategory — archive presentation and full SEO
-- ---------------------------------------------------------------------------
ALTER TABLE "BlogCategory" ADD COLUMN IF NOT EXISTS "isActive"           BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "BlogCategory" ADD COLUMN IF NOT EXISTS "imageId"            TEXT;
ALTER TABLE "BlogCategory" ADD COLUMN IF NOT EXISTS "bannerImageId"      TEXT;
ALTER TABLE "BlogCategory" ADD COLUMN IF NOT EXISTS "archiveTitle"       TEXT;
ALTER TABLE "BlogCategory" ADD COLUMN IF NOT EXISTS "archiveDescription" TEXT;
ALTER TABLE "BlogCategory" ADD COLUMN IF NOT EXISTS "canonicalUrl"       TEXT;
ALTER TABLE "BlogCategory" ADD COLUMN IF NOT EXISTS "ogTitle"            TEXT;
ALTER TABLE "BlogCategory" ADD COLUMN IF NOT EXISTS "ogDescription"      TEXT;
ALTER TABLE "BlogCategory" ADD COLUMN IF NOT EXISTS "ogImageId"          TEXT;
ALTER TABLE "BlogCategory" ADD COLUMN IF NOT EXISTS "noIndex"            BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "BlogCategory" ADD COLUMN IF NOT EXISTS "noFollow"           BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "BlogCategory" DROP CONSTRAINT IF EXISTS "BlogCategory_imageId_fkey";
ALTER TABLE "BlogCategory" ADD CONSTRAINT "BlogCategory_imageId_fkey"
    FOREIGN KEY ("imageId") REFERENCES "Media"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "BlogCategory" DROP CONSTRAINT IF EXISTS "BlogCategory_bannerImageId_fkey";
ALTER TABLE "BlogCategory" ADD CONSTRAINT "BlogCategory_bannerImageId_fkey"
    FOREIGN KEY ("bannerImageId") REFERENCES "Media"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "BlogCategory" DROP CONSTRAINT IF EXISTS "BlogCategory_ogImageId_fkey";
ALTER TABLE "BlogCategory" ADD CONSTRAINT "BlogCategory_ogImageId_fkey"
    FOREIGN KEY ("ogImageId") REFERENCES "Media"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- BlogTag — description, status, ordering and SEO
-- ---------------------------------------------------------------------------
ALTER TABLE "BlogTag" ADD COLUMN IF NOT EXISTS "description"    TEXT;
ALTER TABLE "BlogTag" ADD COLUMN IF NOT EXISTS "isActive"       BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "BlogTag" ADD COLUMN IF NOT EXISTS "sortOrder"      INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "BlogTag" ADD COLUMN IF NOT EXISTS "seoTitle"       TEXT;
ALTER TABLE "BlogTag" ADD COLUMN IF NOT EXISTS "seoDescription" TEXT;
ALTER TABLE "BlogTag" ADD COLUMN IF NOT EXISTS "canonicalUrl"   TEXT;
ALTER TABLE "BlogTag" ADD COLUMN IF NOT EXISTS "noIndex"        BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "BlogTag" ADD COLUMN IF NOT EXISTS "updatedAt"      TIMESTAMP(3);

-- ---------------------------------------------------------------------------
-- BlogPost — editorial fields, per-post display options and full SEO
-- ---------------------------------------------------------------------------
ALTER TABLE "BlogPost" ADD COLUMN IF NOT EXISTS "subtitle"         TEXT;
ALTER TABLE "BlogPost" ADD COLUMN IF NOT EXISTS "featuredPriority" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "BlogPost" ADD COLUMN IF NOT EXISTS "viewCount"        INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "BlogPost" ADD COLUMN IF NOT EXISTS "thumbnailId"      TEXT;
ALTER TABLE "BlogPost" ADD COLUMN IF NOT EXISTS "options"          JSONB NOT NULL DEFAULT '{}';
ALTER TABLE "BlogPost" ADD COLUMN IF NOT EXISTS "sidebarMode"      "BlogSidebarMode" NOT NULL DEFAULT 'GLOBAL';
ALTER TABLE "BlogPost" ADD COLUMN IF NOT EXISTS "focusKeyword"     TEXT;
ALTER TABLE "BlogPost" ADD COLUMN IF NOT EXISTS "noFollow"         BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "BlogPost" ADD COLUMN IF NOT EXISTS "twitterImageId"   TEXT;

CREATE INDEX IF NOT EXISTS "BlogPost_isFeatured_featuredPriority_idx"
    ON "BlogPost"("isFeatured", "featuredPriority");

ALTER TABLE "BlogPost" DROP CONSTRAINT IF EXISTS "BlogPost_thumbnailId_fkey";
ALTER TABLE "BlogPost" ADD CONSTRAINT "BlogPost_thumbnailId_fkey"
    FOREIGN KEY ("thumbnailId") REFERENCES "Media"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "BlogPost" DROP CONSTRAINT IF EXISTS "BlogPost_twitterImageId_fkey";
ALTER TABLE "BlogPost" ADD CONSTRAINT "BlogPost_twitterImageId_fkey"
    FOREIGN KEY ("twitterImageId") REFERENCES "Media"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- BlogSection — the reorderable listing / article / sidebar sets
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "BlogSection" (
    "id"        TEXT NOT NULL,
    "surface"   "BlogSurface" NOT NULL,
    "postId"    TEXT,
    "blockType" TEXT NOT NULL,
    "name"      TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isVisible" BOOLEAN NOT NULL DEFAULT true,
    "content"   JSONB NOT NULL DEFAULT '{}',
    "settings"  JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "BlogSection_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "BlogSection_surface_postId_sortOrder_idx"
    ON "BlogSection"("surface", "postId", "sortOrder");
CREATE INDEX IF NOT EXISTS "BlogSection_postId_idx" ON "BlogSection"("postId");

-- A post's own sidebar goes with the post.
ALTER TABLE "BlogSection" DROP CONSTRAINT IF EXISTS "BlogSection_postId_fkey";
ALTER TABLE "BlogSection" ADD CONSTRAINT "BlogSection_postId_fkey"
    FOREIGN KEY ("postId") REFERENCES "BlogPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- BlogSettings — singleton design + archive SEO record
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "BlogSettings" (
    "id"             TEXT NOT NULL DEFAULT 'singleton',
    "postsPerPage"   INTEGER NOT NULL DEFAULT 9,
    "cardSettings"   JSONB NOT NULL DEFAULT '{}',
    "layoutSettings" JSONB NOT NULL DEFAULT '{}',
    "shareSettings"  JSONB NOT NULL DEFAULT '{}',
    "typography"     JSONB NOT NULL DEFAULT '{}',
    "seoTitle"       TEXT,
    "seoDescription" TEXT,
    "canonicalUrl"   TEXT,
    "ogTitle"        TEXT,
    "ogDescription"  TEXT,
    "ogImageId"      TEXT,
    "noIndex"        BOOLEAN NOT NULL DEFAULT false,
    "noFollow"       BOOLEAN NOT NULL DEFAULT false,
    "updatedAt"      TIMESTAMP(3) NOT NULL,
    CONSTRAINT "BlogSettings_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "BlogSettings" DROP CONSTRAINT IF EXISTS "BlogSettings_ogImageId_fkey";
ALTER TABLE "BlogSettings" ADD CONSTRAINT "BlogSettings_ogImageId_fkey"
    FOREIGN KEY ("ogImageId") REFERENCES "Media"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Backfill
-- ---------------------------------------------------------------------------
-- Existing tags predate updatedAt; give them their creation time rather than
-- leaving a NULL that reads as "never touched".
UPDATE "BlogTag" SET "updatedAt" = "createdAt" WHERE "updatedAt" IS NULL;

-- The singleton is created on first read by the application, but seeding it
-- here means a fresh deploy never races two writers for it.
INSERT INTO "BlogSettings" ("id", "updatedAt")
VALUES ('singleton', CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;

-- ---------------------------------------------------------------------------
-- Lead → blog attribution
-- ---------------------------------------------------------------------------
-- Nullable and SET NULL: deleting an article must never delete or orphan the
-- leads it captured.
ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "blogPostId" TEXT;
CREATE INDEX IF NOT EXISTS "Lead_blogPostId_idx" ON "Lead"("blogPostId");
ALTER TABLE "Lead" DROP CONSTRAINT IF EXISTS "Lead_blogPostId_fkey";
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_blogPostId_fkey"
    FOREIGN KEY ("blogPostId") REFERENCES "BlogPost"("id") ON DELETE SET NULL ON UPDATE CASCADE;
