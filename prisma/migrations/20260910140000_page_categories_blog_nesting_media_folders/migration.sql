-- Page categories, nested blog categories and media folders.
--
-- Every statement here is additive. No column is dropped, no row is touched,
-- and every new column is nullable or defaulted, so existing pages, blog
-- categories and media keep working untouched after this runs.

-- ---------------------------------------------------------------------------
-- PageCategory
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "PageCategory" (
    "id"          TEXT NOT NULL,
    "name"        TEXT NOT NULL,
    "slug"        TEXT NOT NULL,
    "description" TEXT,
    "parentId"    TEXT,
    "sortOrder"   INTEGER NOT NULL DEFAULT 0,
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"   TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PageCategory_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "PageCategory_slug_key" ON "PageCategory"("slug");
CREATE INDEX IF NOT EXISTS "PageCategory_slug_idx" ON "PageCategory"("slug");
CREATE INDEX IF NOT EXISTS "PageCategory_parentId_idx" ON "PageCategory"("parentId");

-- Self-reference for the tree. SetNull promotes children to the top level
-- rather than cascading a delete through the hierarchy.
ALTER TABLE "PageCategory"
    DROP CONSTRAINT IF EXISTS "PageCategory_parentId_fkey";
ALTER TABLE "PageCategory"
    ADD CONSTRAINT "PageCategory_parentId_fkey"
    FOREIGN KEY ("parentId") REFERENCES "PageCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Page gains an optional category. Deleting a category must never delete a
-- page, so this is SET NULL: the page becomes uncategorised.
ALTER TABLE "Page" ADD COLUMN IF NOT EXISTS "categoryId" TEXT;
CREATE INDEX IF NOT EXISTS "Page_categoryId_idx" ON "Page"("categoryId");
ALTER TABLE "Page" DROP CONSTRAINT IF EXISTS "Page_categoryId_fkey";
ALTER TABLE "Page"
    ADD CONSTRAINT "Page_categoryId_fkey"
    FOREIGN KEY ("categoryId") REFERENCES "PageCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- BlogCategory nesting
-- ---------------------------------------------------------------------------
-- Nullable, so every category that exists today stays a valid top-level one
-- and every current /blog/category/<slug> URL keeps resolving.
ALTER TABLE "BlogCategory" ADD COLUMN IF NOT EXISTS "parentId" TEXT;
CREATE INDEX IF NOT EXISTS "BlogCategory_parentId_idx" ON "BlogCategory"("parentId");
ALTER TABLE "BlogCategory" DROP CONSTRAINT IF EXISTS "BlogCategory_parentId_fkey";
ALTER TABLE "BlogCategory"
    ADD CONSTRAINT "BlogCategory_parentId_fkey"
    FOREIGN KEY ("parentId") REFERENCES "BlogCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- MediaFolder
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "MediaFolder" (
    "id"        TEXT NOT NULL,
    "name"      TEXT NOT NULL,
    "parentId"  TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "MediaFolder_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "MediaFolder_parentId_idx" ON "MediaFolder"("parentId");

ALTER TABLE "MediaFolder" DROP CONSTRAINT IF EXISTS "MediaFolder_parentId_fkey";
ALTER TABLE "MediaFolder"
    ADD CONSTRAINT "MediaFolder_parentId_fkey"
    FOREIGN KEY ("parentId") REFERENCES "MediaFolder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Media gains a folder. Deleting a folder must never delete a file, so this is
-- SET NULL: the item falls back to Uncategorised. The existing free-text
-- "folder" column and every storageKey/url are left exactly as they are.
ALTER TABLE "Media" ADD COLUMN IF NOT EXISTS "folderId" TEXT;
CREATE INDEX IF NOT EXISTS "Media_folderId_idx" ON "Media"("folderId");
ALTER TABLE "Media" DROP CONSTRAINT IF EXISTS "Media_folderId_fkey";
ALTER TABLE "Media"
    ADD CONSTRAINT "Media_folderId_fkey"
    FOREIGN KEY ("folderId") REFERENCES "MediaFolder"("id") ON DELETE SET NULL ON UPDATE CASCADE;
