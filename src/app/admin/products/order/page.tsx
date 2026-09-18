import type { Metadata } from 'next';
import Link from 'next/link';
import { requirePermission, userCan } from '@/lib/auth/guards';
import { prisma } from '@/lib/db/prisma';
import { AdminPageHeader } from '@/components/admin/page-header';
import { ProductOrderList, type OrderableProduct } from '@/components/admin/products/product-order';
import { buttonClasses } from '@/components/ui/button';

export const metadata: Metadata = { title: 'Product order' };
export const dynamic = 'force-dynamic';

const select = {
  id: true,
  name: true,
  slug: true,
  status: true,
  isFeatured: true,
  category: { select: { name: true } },
  brand: { select: { name: true } },
  image: { select: { url: true } },
} as const;

type Row = {
  id: string;
  name: string;
  slug: string;
  status: string;
  isFeatured: boolean;
  category: { name: string } | null;
  brand: { name: string } | null;
  image: { url: string } | null;
};

function toOrderable(row: Row): OrderableProduct {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    status: row.status,
    isFeatured: row.isFeatured,
    categoryName: row.category?.name ?? null,
    brandName: row.brand?.name ?? null,
    imageUrl: row.image?.url ?? null,
  };
}

/**
 * Manual product ordering for both the catalogue and the featured rail.
 *
 * Sits alongside the numeric "Sort order" field on the product form — this is
 * the visual way to do the same thing.
 */
export default async function ProductOrderPage() {
  const user = await requirePermission('products.view');
  const canEdit = userCan(user, 'products.edit');

  const [catalogue, featured] = await Promise.all([
    prisma.product.findMany({
      where: { deletedAt: null },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      take: 300,
      select,
    }),
    prisma.product.findMany({
      where: { deletedAt: null, isFeatured: true },
      orderBy: [{ featuredOrder: 'asc' }, { sortOrder: 'asc' }, { name: 'asc' }],
      take: 100,
      select,
    }),
  ]);

  return (
    <>
      <AdminPageHeader
        title="Product order"
        description="Drag products into the order you want. Use the arrows if you prefer the keyboard."
        crumbs={[{ label: 'Products', href: '/admin/products' }, { label: 'Order' }]}
        actions={
          <Link href="/admin/products" className={buttonClasses('outline', 'sm')}>
            Back to products
          </Link>
        }
      />

      <div className="space-y-6">
        <ProductOrderList
          products={featured.map((row) => toOrderable(row as Row))}
          scope="featured"
          canEdit={canEdit}
        />
        <ProductOrderList
          products={catalogue.map((row) => toOrderable(row as Row))}
          scope="catalogue"
          canEdit={canEdit}
        />
      </div>
    </>
  );
}
