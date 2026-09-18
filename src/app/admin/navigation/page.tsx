import type { Metadata } from 'next';
import { prisma } from '@/lib/db/prisma';
import { requirePermission, userCan } from '@/lib/auth/guards';
import { AdminPageHeader } from '@/components/admin/page-header';
import { MenuManager, type MenuSummary } from '@/components/admin/navigation/menu-manager';
import type { EditorItem, NavTargets } from '@/components/admin/navigation/nav-editor';
import { Alert } from '@/components/ui/states';
import { getAdminCountryScope } from '@/lib/country/admin';

export const metadata: Metadata = { title: 'Navigation' };
export const dynamic = 'force-dynamic';

export default async function NavigationAdmin() {
  const user = await requirePermission('navigation.manage');

  /*
   * Menus belong to a market, so this screen edits the menus of the market
   * chosen in the topbar — and the pages it offers as link targets are that
   * market's pages, which is what stops a UAE menu linking at an India page.
   */
  const scope = await getAdminCountryScope();
  const countryId = scope.country.id;

  const [menus, pages, products, posts, categories] = await Promise.all([
    prisma.navigation.findMany({
      where: { countryId },
      orderBy: { createdAt: 'asc' },
      include: { items: { orderBy: { sortOrder: 'asc' } } },
    }),
    prisma.page.findMany({
      where: { deletedAt: null, countryId },
      orderBy: { title: 'asc' },
      select: { id: true, title: true, slug: true },
    }),
    prisma.product.findMany({
      where: { deletedAt: null },
      orderBy: { name: 'asc' },
      select: { id: true, name: true },
    }),
    prisma.blogPost.findMany({
      where: { deletedAt: null, countryId },
      orderBy: { publishedAt: 'desc' },
      take: 100,
      select: { id: true, title: true },
    }),
    prisma.blogCategory.findMany({ orderBy: { name: 'asc' }, select: { id: true, name: true } }),
  ]);

  const toEditorItem = (row: (typeof menus)[number]['items'][number]): EditorItem => ({
    key: row.id,
    id: row.id,
    label: row.label,
    linkType: row.linkType,
    url: row.url ?? '',
    pageId: row.pageId ?? '',
    productId: row.productId ?? '',
    blogPostId: row.blogPostId ?? '',
    blogCategoryId: row.blogCategoryId ?? '',
    description: row.description ?? '',
    openInNewTab: row.openInNewTab,
    isHighlighted: row.isHighlighted,
    isVisible: row.isVisible,
    children: [],
  });

  const summaries: MenuSummary[] = menus.map((menu) => {
    const byId = new Map(menu.items.map((item) => [item.id, toEditorItem(item)]));
    const roots: EditorItem[] = [];

    for (const item of menu.items) {
      const editor = byId.get(item.id)!;
      if (item.parentId && byId.has(item.parentId)) byId.get(item.parentId)!.children.push(editor);
      else roots.push(editor);
    }

    return { id: menu.id, name: menu.name, slug: menu.slug, location: menu.location, items: roots };
  });

  const targets: NavTargets = { pages, products, posts, categories };

  return (
    <>
      <AdminPageHeader
        title="Navigation"
        description={
          scope.canSwitch
            ? `Menus shown in the header and footer of the ${scope.country.name} storefront. Changes appear on the site immediately.`
            : 'Menus shown in the header and footer. Changes appear on the site immediately.'
        }
        crumbs={[{ label: 'Navigation' }]}
      />

      <Alert tone="info" className="mb-5">
        The first header menu is used as the main navigation. Every footer menu renders as a column with its
        name as the heading, and the legal menu appears beside the copyright line.
      </Alert>

      <MenuManager
        menus={summaries}
        targets={targets}
        countryId={countryId}
        countryName={scope.country.name}
        showCountry={scope.canSwitch}
        canEdit={userCan(user, 'navigation.manage')}
      />
    </>
  );
}
