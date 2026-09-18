import type { Metadata } from 'next';
import { prisma } from '@/lib/db/prisma';
import { requirePermission } from '@/lib/auth/guards';
import { AdminPageHeader } from '@/components/admin/page-header';
import { FormBuilder } from '@/components/admin/forms/form-builder';
import { EMPTY_FORM, starterFields } from '@/lib/cms/form-model';
import { getAdminCountryScope } from '@/lib/country/admin';

export const metadata: Metadata = { title: 'New form' };
export const dynamic = 'force-dynamic';

/**
 * New form.
 *
 * EMPTY_FORM and starterFields come from lib/cms/form-model, not from the
 * builder component. They used to be imported from the `'use client'` module,
 * which made them client references on the server — spreading EMPTY_FORM and
 * calling the field factory here threw, so the route 500'd and the "New form"
 * button looked like it did nothing.
 */
export default async function NewForm() {
  await requirePermission('forms.create');

  const [products, scope] = await Promise.all([
    prisma.product.findMany({
      where: { deletedAt: null },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      select: { id: true, name: true },
    }),
    getAdminCountryScope(),
  ]);

  return (
    <>
      <AdminPageHeader
        title="New form"
        description="Add fields, then use this form in a CMS section, a hero, a product button or a popup."
        crumbs={[{ label: 'Forms', href: '/admin/forms' }, { label: 'New' }]}
      />
      <FormBuilder
        initial={{ ...EMPTY_FORM, fields: starterFields() }}
        products={products}
        countries={
          scope.canSwitch
            ? scope.countries.map((country) => ({ id: country.id, name: country.name }))
            : []
        }
        mode="create"
        canEdit
      />
    </>
  );
}
