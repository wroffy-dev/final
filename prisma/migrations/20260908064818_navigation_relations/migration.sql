-- CreateIndex
CREATE INDEX "NavigationItem_pageId_idx" ON "NavigationItem"("pageId");

-- CreateIndex
CREATE INDEX "NavigationItem_productId_idx" ON "NavigationItem"("productId");

-- CreateIndex
CREATE INDEX "NavigationItem_blogPostId_idx" ON "NavigationItem"("blogPostId");

-- CreateIndex
CREATE INDEX "NavigationItem_blogCategoryId_idx" ON "NavigationItem"("blogCategoryId");

-- AddForeignKey
ALTER TABLE "NavigationItem" ADD CONSTRAINT "NavigationItem_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "Page"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NavigationItem" ADD CONSTRAINT "NavigationItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NavigationItem" ADD CONSTRAINT "NavigationItem_blogPostId_fkey" FOREIGN KEY ("blogPostId") REFERENCES "BlogPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NavigationItem" ADD CONSTRAINT "NavigationItem_blogCategoryId_fkey" FOREIGN KEY ("blogCategoryId") REFERENCES "BlogCategory"("id") ON DELETE CASCADE ON UPDATE CASCADE;
