-- Free-form builder sections for products.
--
-- Additive only: a new table with a cascading foreign key. Nothing on Product
-- or ProductCountry changes, so every existing product keeps rendering from its
-- fixed fields until someone adds a section to it.
--
-- Attached to Product rather than ProductCountry because a product is one
-- global row; the internal links inside the stored content are localised per
-- market at render time.

-- CreateTable
CREATE TABLE "ProductSection" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "blockType" TEXT NOT NULL,
    "name" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isVisible" BOOLEAN NOT NULL DEFAULT true,
    "content" JSONB NOT NULL DEFAULT '{}',
    "settings" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductSection_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProductSection_productId_sortOrder_idx" ON "ProductSection"("productId", "sortOrder");

-- AddForeignKey
ALTER TABLE "ProductSection" ADD CONSTRAINT "ProductSection_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
