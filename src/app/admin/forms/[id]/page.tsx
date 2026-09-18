import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { prisma } from '@/lib/db/prisma';
import { requirePermission, userCan } from '@/lib/auth/guards';
import { AdminPageHeader } from '@/components/admin/page-header';
import { FormBuilder } from '@/components/admin/forms/form-builder';
import type { FormBuilderValues, BuilderField } from '@/lib/cms/form-model';
import { parseFormDesign } from '@/lib/forms/form-design';
import { parseFieldSettings } from '@/lib/forms/field-settings';
import { SubmissionsPanel } from '@/components/admin/forms/submissions-panel';
import { Badge } from '@/components/ui/badge';
import { getAdminCountryScope } from '@/lib/country/admin';

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const form = await prisma.form.findUnique({ where: { id }, select: { name: true } });
  return { title: form ? `Edit ${form.name}` : 'Form' };
}

function parseOptions(raw: unknown): Array<{ label: string; value: string }> {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((o): o is { label?: unknown; value?: unknown } => typeof o === 'object' && o !== null)
    .map((o) => ({ label: String(o.label ?? ''), value: String(o.value ?? '') }));
}

export default async function EditForm({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePermission('forms.view');
  const { id } = await params;

  const [form, products, submissions, scope] = await Promise.all([
    prisma.form.findFirst({
      where: { id, deletedAt: null },
      include: { fields: { orderBy: { sortOrder: 'asc' } } },
    }),
    prisma.product.findMany({
      where: { deletedAt: null },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      select: { id: true, name: true },
    }),
    prisma.formSubmission.findMany({
      where: { formId: id },
      orderBy: { createdAt: 'desc' },
      take: 25,
      select: { id: true, data: true, createdAt: true, pageUrl: true, leadId: true },
    }),
    getAdminCountryScope(),
  ]);
  if (!form) notFound();

  const fields: BuilderField[] = form.fields.map((field) => ({
    key: field.id,
    id: field.id,
    type: field.type,
    label: field.label,
    name: field.name,
    placeholder: field.placeholder ?? '',
    helpText: field.helpText ?? '',
    defaultValue: field.defaultValue ?? '',
    isRequired: field.isRequired,
    width: field.width === 'half' ? 'half' : 'full',
    options: parseOptions(field.options),
    minLength: field.minLength === null ? '' : String(field.minLength),
    maxLength: field.maxLength === null ? '' : String(field.maxLength),
    pattern: field.pattern ?? '',
    showLabel: field.showLabel,
    isEnabled: field.isEnabled,
    isHidden: field.isHidden,
    isReadOnly: field.isReadOnly,
    colSpan: field.colSpan === null ? '' : String(field.colSpan),
    cssClass: field.cssClass ?? '',
    settings: parseFieldSettings(field.settings),
  }));

  const initial: FormBuilderValues = {
    id: form.id,
    design: parseFormDesign(form.design),
    name: form.name,
    slug: form.slug,
    description: form.description ?? '',
    isActive: form.isActive,
    submitLabel: form.submitLabel,
    successMessage: form.successMessage,
    redirectUrl: form.redirectUrl ?? '',
    leadSource: form.leadSource ?? '',
    countryId: form.countryId ?? '',
    defaultProductId: form.defaultProductId ?? '',
    createsLead: form.createsLead,
    notifyEmails: form.notifyEmails ?? '',
    consentText: form.consentText ?? '',
    lawfulBasis: form.lawfulBasis,
    collectsPersonalData: form.collectsPersonalData,
    offerMarketingConsent: form.offerMarketingConsent,
    requireTermsAcceptance: form.requireTermsAcceptance,
    consentCombinedLabel: form.consentCombinedLabel ?? '',
    requireCaptcha: form.requireCaptcha,
    fields,
  };

  return (
    <>
      <AdminPageHeader
        title={form.name}
        description={`Referenced as “${form.slug}” from CMS blocks, product buttons and popups.`}
        crumbs={[{ label: 'Forms', href: '/admin/forms' }, { label: form.name }]}
        actions={
          <Badge tone={form.isActive ? 'success' : 'neutral'}>
            {form.isActive ? 'Active' : 'Inactive'}
          </Badge>
        }
      />

      <FormBuilder
        initial={initial}
        products={products}
        countries={
          scope.canSwitch
            ? scope.countries.map((country) => ({ id: country.id, name: country.name }))
            : []
        }
        mode="edit"
        canEdit={userCan(user, 'forms.edit')}
      />

      <div className="mt-6">
        <SubmissionsPanel
          formId={form.id}
          fieldNames={form.fields.map((f) => ({ name: f.name, label: f.label }))}
          submissions={submissions.map((submission) => ({
            id: submission.id,
            data: (submission.data ?? {}) as Record<string, string>,
            createdAt: submission.createdAt.toISOString(),
            pageUrl: submission.pageUrl,
            leadId: submission.leadId,
          }))}
        />
      </div>
    </>
  );
}
