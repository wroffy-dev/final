'use server';

import { prisma } from '@/lib/db/prisma';
import { getCurrentUser, userCan } from '@/lib/auth/guards';
import { listAccessibleCountries } from '@/lib/country/access';

export type SearchHit = {
  id: string;
  type: 'Lead' | 'Customer' | 'Page' | 'Product' | 'Post' | 'Media' | 'Staff' | 'Form';
  title: string;
  subtitle: string | null;
  href: string;
};

/**
 * Global admin search. Every group is gated by the caller's permissions, so a
 * Sales user never sees pages or staff in their results.
 *
 * Market-scoped content is additionally limited to the markets the caller may
 * work in, so search cannot hand someone a page from a storefront they cannot
 * open. Where more than one market exists, each hit names its own.
 */
export async function adminSearch(query: string): Promise<SearchHit[]> {
  const user = await getCurrentUser();
  if (!user) return [];

  const q = query.trim();
  if (q.length < 2) return [];
  const contains = { contains: q, mode: 'insensitive' as const };
  const take = 5;
  const hits: SearchHit[] = [];

  const countries = await listAccessibleCountries(user, { includeInactive: true });
  const multiCountry = countries.length > 1;
  // No restriction rows means every market, which needs no clause at all.
  const countryScope =
    user.role === 'super-admin' ? {} : { countryId: { in: countries.map((c) => c.id) } };

  const tasks: Array<Promise<void>> = [];

  if (userCan(user, 'leads.view')) {
    tasks.push(
      prisma.lead
        .findMany({
          where: {
            deletedAt: null,
            OR: [{ name: contains }, { email: contains }, { company: contains }, { phone: contains }],
          },
          orderBy: { createdAt: 'desc' },
          take,
          select: { id: true, name: true, email: true, company: true, status: true },
        })
        .then((rows) => {
          for (const row of rows) {
            hits.push({
              id: row.id,
              type: 'Lead',
              title: row.name,
              subtitle: [row.company, row.email].filter(Boolean).join(' · '),
              href: `/admin/leads/${row.id}`,
            });
          }
        }),
    );
  }

  if (userCan(user, 'customers.view')) {
    tasks.push(
      prisma.customer
        .findMany({
          where: { deletedAt: null, OR: [{ name: contains }, { email: contains }, { company: contains }] },
          take,
          select: { id: true, name: true, company: true, email: true },
        })
        .then((rows) => {
          for (const row of rows) {
            hits.push({
              id: row.id,
              type: 'Customer',
              title: row.name,
              subtitle: [row.company, row.email].filter(Boolean).join(' · '),
              href: `/admin/customers/${row.id}`,
            });
          }
        }),
    );
  }

  if (userCan(user, 'pages.view')) {
    tasks.push(
      prisma.page
        .findMany({
          where: {
            deletedAt: null,
            ...countryScope,
            OR: [{ title: contains }, { slug: contains }],
          },
          take,
          select: {
            id: true,
            title: true,
            slug: true,
            status: true,
            country: { select: { name: true, slug: true } },
          },
        })
        .then((rows) => {
          for (const row of rows) {
            hits.push({
              id: row.id,
              type: 'Page',
              title: row.title,
              subtitle: [
                `/${[row.country.slug, row.slug].filter(Boolean).join('/')}`,
                row.status.toLowerCase(),
                multiCountry ? row.country.name : null,
              ]
                .filter(Boolean)
                .join(' · '),
              href: `/admin/pages/${row.id}`,
            });
          }
        }),
    );
  }

  if (userCan(user, 'products.view')) {
    tasks.push(
      prisma.product
        .findMany({
          where: { deletedAt: null, OR: [{ name: contains }, { slug: contains }, { sku: contains }] },
          take,
          select: { id: true, name: true, sku: true, status: true },
        })
        .then((rows) => {
          for (const row of rows) {
            hits.push({
              id: row.id,
              type: 'Product',
              title: row.name,
              subtitle: [row.sku, row.status.toLowerCase()].filter(Boolean).join(' · '),
              href: `/admin/products/${row.id}`,
            });
          }
        }),
    );
  }

  if (userCan(user, 'blog.view')) {
    tasks.push(
      prisma.blogPost
        .findMany({
          where: {
            deletedAt: null,
            ...countryScope,
            OR: [{ title: contains }, { slug: contains }],
          },
          take,
          select: { id: true, title: true, status: true, country: { select: { name: true } } },
        })
        .then((rows) => {
          for (const row of rows) {
            hits.push({
              id: row.id,
              type: 'Post',
              title: row.title,
              subtitle: [row.status.toLowerCase(), multiCountry ? row.country.name : null]
                .filter(Boolean)
                .join(' · '),
              href: `/admin/blog/${row.id}`,
            });
          }
        }),
    );
  }

  if (userCan(user, 'forms.view')) {
    tasks.push(
      prisma.form
        .findMany({
          where: { deletedAt: null, OR: [{ name: contains }, { slug: contains }] },
          take,
          select: { id: true, name: true, slug: true },
        })
        .then((rows) => {
          for (const row of rows) {
            hits.push({
              id: row.id,
              type: 'Form',
              title: row.name,
              subtitle: `/${row.slug}`,
              href: `/admin/forms/${row.id}`,
            });
          }
        }),
    );
  }

  if (userCan(user, 'media.view')) {
    tasks.push(
      prisma.media
        .findMany({
          where: { deletedAt: null, OR: [{ filename: contains }, { title: contains }, { altText: contains }] },
          take,
          select: { id: true, filename: true, title: true, mimeType: true },
        })
        .then((rows) => {
          for (const row of rows) {
            hits.push({
              id: row.id,
              type: 'Media',
              title: row.title || row.filename,
              subtitle: row.mimeType,
              href: `/admin/media?selected=${row.id}`,
            });
          }
        }),
    );
  }

  if (userCan(user, 'staff.manage')) {
    tasks.push(
      prisma.user
        .findMany({
          where: { deletedAt: null, OR: [{ name: contains }, { email: contains }] },
          take,
          select: { id: true, name: true, email: true },
        })
        .then((rows) => {
          for (const row of rows) {
            hits.push({
              id: row.id,
              type: 'Staff',
              title: row.name,
              subtitle: row.email,
              href: `/admin/staff/${row.id}`,
            });
          }
        }),
    );
  }

  await Promise.all(tasks);
  return hits.slice(0, 24);
}
