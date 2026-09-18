import 'server-only';
import { cache } from 'react';
import { prisma } from '@/lib/db/prisma';
import { countryPath, countryHref } from '@/lib/country/routing';
import type { CountryContext } from '@/lib/country/types';
import type { NavigationLocation, NavLinkType } from '@prisma/client';

export type ResolvedNavItem = {
  id: string;
  label: string;
  href: string;
  description: string | null;
  openInNewTab: boolean;
  isHighlighted: boolean;
  children: ResolvedNavItem[];
};

export type ResolvedNavigation = {
  id: string;
  name: string;
  slug: string;
  items: ResolvedNavItem[];
};

/**
 * Turns a stored menu item into a link inside `country`.
 *
 * Menus belong to a market, so the pages, products and articles they point at
 * are that market's — and the URL they resolve to carries that market's prefix.
 * A hand-typed internal URL goes through `countryHref`, which leaves external
 * links, anchors and system routes exactly as the editor wrote them.
 */
function hrefFor(
  item: {
    linkType: NavLinkType;
    url: string | null;
    page: { slug: string } | null;
    product: { slug: string } | null;
    blogPost: { slug: string } | null;
    blogCategory: { slug: string } | null;
  },
  country: CountryContext,
): string {
  switch (item.linkType) {
    case 'PAGE':
      return item.page ? countryPath(country, item.page.slug) : '#';
    case 'PRODUCT':
      return item.product ? countryPath(country, `products/${item.product.slug}`) : '#';
    case 'BLOG_POST':
      return item.blogPost ? countryPath(country, `blog/${item.blogPost.slug}`) : '#';
    case 'BLOG_CATEGORY':
      return item.blogCategory ? countryPath(country, `blog/category/${item.blogCategory.slug}`) : '#';
    default:
      return item.url ? countryHref(country, item.url) : '#';
  }
}

const navInclude = {
  page: { select: { slug: true } },
  product: { select: { slug: true } },
  blogPost: { select: { slug: true } },
  blogCategory: { select: { slug: true } },
};

/** Loads every menu in a location for one market, with items resolved to real hrefs. */
export const getNavigations = cache(
  async (country: CountryContext, location: NavigationLocation): Promise<ResolvedNavigation[]> => {
    const menus = await prisma.navigation.findMany({
      where: { location, countryId: country.id },
      orderBy: { createdAt: 'asc' },
      include: {
        items: {
          where: { isVisible: true },
          orderBy: { sortOrder: 'asc' },
          include: navInclude,
        },
      },
    });

    return menus.map((menu) => {
      const byParent = new Map<string | null, typeof menu.items>();
      for (const item of menu.items) {
        const key = item.parentId ?? null;
        const list = byParent.get(key) ?? [];
        list.push(item);
        byParent.set(key, list);
      }

      const build = (parentId: string | null): ResolvedNavItem[] =>
        (byParent.get(parentId) ?? []).map((item) => ({
          id: item.id,
          label: item.label,
          href: hrefFor(item, country),
          description: item.description,
          openInNewTab: item.openInNewTab,
          isHighlighted: item.isHighlighted,
          children: build(item.id),
        }));

      return { id: menu.id, name: menu.name, slug: menu.slug, items: build(null) };
    });
  },
);

export const getPrimaryNavigation = cache(
  async (country: CountryContext): Promise<ResolvedNavItem[]> => {
    const menus = await getNavigations(country, 'HEADER');
    return menus[0]?.items ?? [];
  },
);
