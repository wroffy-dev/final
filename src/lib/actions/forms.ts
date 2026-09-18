'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { prisma } from '@/lib/db/prisma';
import { authorize } from '@/lib/auth/guards';
import { recordAudit } from '@/lib/services/audit';
import { formInputSchema, duplicateFieldNames } from '@/lib/validation/form';
import { uniqueSlug, slugify } from '@/lib/utils/slug';
import { sanitizeText } from '@/lib/utils/sanitize';
import { marketingConflict } from '@/lib/privacy/consent';
import { toCsv } from '@/lib/utils/csv';
import { success, failure, toActionError, type ActionResult } from '@/lib/utils/result';
import { resolveActionCountry } from '@/lib/country/admin';
import { Prisma } from '@prisma/client';

/**
 * Is this slug already used in the market the form belongs to?
 *
 * Slugs are unique per market, so India and the UAE can each own a "contact"
 * form — which is what stops a sync having to invent "contact-ae".
 *
 * Forms shared by every market (`countryId` null) are checked here rather than
 * by the database: SQL treats two NULLs as distinct, so the unique index cannot
 * catch a second shared form with the same slug and this is the only place that
 * can.
 */
async function slugTaken(
  slug: string,
  countryId: string | null,
  exceptId: string | null,
): Promise<boolean> {
  const existing = await prisma.form.findFirst({
    where: { slug, countryId, ...(exceptId ? { id: { not: exceptId } } : {}) },
    select: { id: true },
  });
  return Boolean(existing);
}

export async function saveForm(
  formId: string | null,
  payload: unknown,
): Promise<ActionResult<{ id: string }>> {
  try {
    const user = await authorize(formId ? 'forms.edit' : 'forms.create');
    const input = formInputSchema.parse(payload);

    const blankNames = input.fields.filter((f) => !f.name);
    if (blankNames.length > 0) {
      return failure('Every field needs a machine name.', {
        fields: ['One or more fields have an empty name'],
      });
    }

    const duplicates = duplicateFieldNames(input.fields);
    if (duplicates.length > 0) {
      return failure(`Duplicate field names: ${duplicates.join(', ')}`, {
        fields: [`These names are used more than once: ${duplicates.join(', ')}`],
      });
    }

    /*
     * A form is either shared by every market (null) or bound to one. The id
     * is validated against the markets the user may work in, so a crafted
     * payload cannot bind a form to a market they cannot reach.
     *
     * Resolved before the slug, because a slug is only unique within a market:
     * India and the UAE may each own a "contact" form.
     */
    const countryId = input.countryId
      ? (await resolveActionCountry(user, input.countryId)).id
      : null;

    const slug =
      formId === null
        ? await uniqueSlug(input.slug || slugify(input.name), (candidate) =>
            slugTaken(candidate, countryId, null),
          )
        : input.slug;

    if (formId && (await slugTaken(slug, countryId, formId))) {
      return failure('Another form already uses that slug.', { slug: ['This slug is taken'] });
    }

    /*
     * A form shows one tick box. Optional marketing cannot ride on a box the
     * visitor has to tick to submit, because then "send me marketing" is the
     * price of getting an answer — so this combination is refused here rather
     * than quietly resolved, and the administrator is told which switch to
     * change. (`resolveConsentRequirement` also drops marketing from a form
     * that already holds this combination, so no visitor ever sees it; this is
     * what stops a new one being saved.)
     */
    const conflict = marketingConflict(input);
    if (conflict) {
      return failure(conflict, { offerMarketingConsent: [conflict] });
    }

    const data = {
      name: sanitizeText(input.name),
      slug,
      countryId,
      description: input.description ? sanitizeText(input.description) : null,
      isActive: input.isActive,
      submitLabel: sanitizeText(input.submitLabel),
      successMessage: sanitizeText(input.successMessage),
      redirectUrl: input.redirectUrl,
      leadSource: input.leadSource,
      defaultProductId: input.defaultProductId,
      createsLead: input.createsLead,
      notifyEmails: input.notifyEmails,
      consentText: input.consentText ? sanitizeText(input.consentText) : null,
      lawfulBasis: input.lawfulBasis,
      collectsPersonalData: input.collectsPersonalData,
      offerMarketingConsent: input.offerMarketingConsent,
      requireTermsAcceptance: input.requireTermsAcceptance,
      consentCombinedLabel: input.consentCombinedLabel
        ? sanitizeText(input.consentCombinedLabel)
        : null,
      requireCaptcha: input.requireCaptcha,
      // Omitted by a payload that does not mean to restyle the form, in which
      // case `undefined` leaves the stored design untouched rather than wiping
      // it back to defaults.
      design: input.design ? (input.design as Prisma.InputJsonValue) : undefined,
    };

    const form = await prisma.$transaction(async (tx) => {
      const record = formId
        ? await tx.form.update({ where: { id: formId }, data })
        : await tx.form.create({ data });

      const keepIds = input.fields.map((f) => f.id).filter((id): id is string => Boolean(id));
      // Removing a field also removes it from future submissions; historical
      // submission payloads are stored as JSON and keep their original keys.
      await tx.formField.deleteMany({
        where: { formId: record.id, ...(keepIds.length ? { id: { notIn: keepIds } } : {}) },
      });

      for (const [index, field] of input.fields.entries()) {
        const fieldData = {
          formId: record.id,
          type: field.type,
          label: sanitizeText(field.label),
          name: field.name,
          placeholder: field.placeholder,
          helpText: field.helpText,
          defaultValue: field.defaultValue,
          isRequired: field.isRequired,
          width: field.width,
          sortOrder: (index + 1) * 10,
          options: field.options as Prisma.InputJsonValue,
          minLength: field.minLength ?? null,
          maxLength: field.maxLength ?? null,
          pattern: field.pattern,
          showLabel: field.showLabel,
          isEnabled: field.isEnabled,
          isHidden: field.isHidden,
          isReadOnly: field.isReadOnly,
          colSpan: field.colSpan ?? null,
          cssClass: field.cssClass || null,
          settings: field.settings
            ? (field.settings as Prisma.InputJsonValue)
            : Prisma.DbNull,
        };

        if (field.id) {
          await tx.formField.update({ where: { id: field.id }, data: fieldData });
        } else {
          await tx.formField.create({ data: fieldData });
        }
      }

      return record;
    });

    await recordAudit({
      actor: user,
      action: formId ? 'updated' : 'created',
      entity: 'Form',
      entityId: form.id,
      summary: `${formId ? 'Updated' : 'Created'} form “${form.name}” (${input.fields.length} field(s))`,
    });

    revalidatePath('/admin/forms');
    revalidatePath('/', 'layout');
    return success({ id: form.id }, 'Form saved.');
  } catch (error) {
    return toActionError(error);
  }
}

export async function toggleFormActive(formId: string): Promise<ActionResult> {
  try {
    const user = await authorize('forms.edit');
    const form = await prisma.form.findUnique({ where: { id: formId } });
    if (!form) return failure('That form no longer exists.');

    await prisma.form.update({ where: { id: formId }, data: { isActive: !form.isActive } });

    await recordAudit({
      actor: user,
      action: form.isActive ? 'deactivated' : 'activated',
      entity: 'Form',
      entityId: formId,
      summary: `${form.isActive ? 'Deactivated' : 'Activated'} form “${form.name}”`,
    });

    revalidatePath('/admin/forms');
    revalidatePath('/', 'layout');
    return success(undefined, form.isActive ? 'Form deactivated.' : 'Form activated.');
  } catch (error) {
    return toActionError(error);
  }
}

export async function duplicateForm(formId: string): Promise<ActionResult<{ id: string }>> {
  try {
    const user = await authorize('forms.create');
    const source = await prisma.form.findUnique({
      where: { id: formId },
      include: { fields: { orderBy: { sortOrder: 'asc' } } },
    });
    if (!source) return failure('That form no longer exists.');

    const slug = await uniqueSlug(`${source.slug}-copy`, (candidate) =>
      slugTaken(candidate, source.countryId, null),
    );

    const copy = await prisma.form.create({
      data: {
        name: `${source.name} (copy)`,
        slug,
        // A copy belongs to the market the original does. Without this a copy
        // of one market's form became a shared form rendering in all of them.
        countryId: source.countryId,
        description: source.description,
        isActive: false,
        submitLabel: source.submitLabel,
        successMessage: source.successMessage,
        redirectUrl: source.redirectUrl,
        leadSource: source.leadSource,
        defaultProductId: source.defaultProductId,
        createsLead: source.createsLead,
        notifyEmails: source.notifyEmails,
        consentText: source.consentText,
        lawfulBasis: source.lawfulBasis,
        collectsPersonalData: source.collectsPersonalData,
        offerMarketingConsent: source.offerMarketingConsent,
        requireTermsAcceptance: source.requireTermsAcceptance,
        consentCombinedLabel: source.consentCombinedLabel,
        requireCaptcha: source.requireCaptcha,
        fields: {
          create: source.fields.map((field) => ({
            type: field.type,
            label: field.label,
            name: field.name,
            placeholder: field.placeholder,
            helpText: field.helpText,
            defaultValue: field.defaultValue,
            isRequired: field.isRequired,
            width: field.width,
            sortOrder: field.sortOrder,
            options: field.options as Prisma.InputJsonValue,
            minLength: field.minLength,
            maxLength: field.maxLength,
            pattern: field.pattern,
          })),
        },
      },
    });

    await recordAudit({
      actor: user,
      action: 'duplicated',
      entity: 'Form',
      entityId: copy.id,
      summary: `Duplicated form “${source.name}”`,
    });

    revalidatePath('/admin/forms');
    return success({ id: copy.id }, 'Form duplicated.');
  } catch (error) {
    return toActionError(error);
  }
}

export async function deleteForm(formId: string): Promise<ActionResult> {
  try {
    const user = await authorize('forms.delete');
    const form = await prisma.form.findUnique({
      where: { id: formId },
      include: { _count: { select: { submissions: true, leads: true } } },
    });
    if (!form) return failure('That form no longer exists.');

    // Soft delete: submissions and leads reference the form.
    await prisma.form.update({
      where: { id: formId },
      data: { deletedAt: new Date(), isActive: false, slug: `${form.slug}-deleted-${Date.now()}` },
    });

    await recordAudit({
      actor: user,
      action: 'deleted',
      entity: 'Form',
      entityId: formId,
      summary: `Deleted form “${form.name}” (${form._count.submissions} submission(s) retained)`,
    });

    revalidatePath('/admin/forms');
    revalidatePath('/', 'layout');
    return success(undefined, 'Form deleted. Existing submissions and leads are retained.');
  } catch (error) {
    return toActionError(error);
  }
}

const exportSchema = z.object({ formId: z.string().min(1) });

/** CSV of a form's submissions. Header order follows the current field order. */
// ---------------------------------------------------------------------------
// Bulk actions
// ---------------------------------------------------------------------------

const formBulkSchema = z.object({
  ids: z.array(z.string().min(1)).min(1).max(100),
  action: z.enum(['activate', 'deactivate', 'captchaOn', 'captchaOff', 'delete']),
});

/**
 * Applies one change to several forms at once.
 *
 * Takes the same permission the single-record action does, and deletes stay
 * soft with the slug freed — submissions and leads reference the form, so
 * removing the row would take their history with it.
 */
export async function bulkFormAction(input: unknown): Promise<ActionResult> {
  try {
    const { ids, action } = formBulkSchema.parse(input);
    const user =
      action === 'delete' ? await authorize('forms.delete') : await authorize('forms.edit');

    const forms = await prisma.form.findMany({
      where: { id: { in: ids }, deletedAt: null },
      select: { id: true, slug: true },
    });
    if (forms.length === 0) return failure('Those forms no longer exist.');
    const targetIds = forms.map((form) => form.id);

    if (action === 'delete') {
      // Each slug is freed individually, so a later form may reuse the name.
      await prisma.$transaction(
        forms.map((form) =>
          prisma.form.update({
            where: { id: form.id },
            data: {
              deletedAt: new Date(),
              isActive: false,
              slug: `${form.slug}-deleted-${Date.now()}`,
            },
          }),
        ),
      );
    } else if (action === 'activate' || action === 'deactivate') {
      await prisma.form.updateMany({
        where: { id: { in: targetIds } },
        data: { isActive: action === 'activate' },
      });
    } else {
      await prisma.form.updateMany({
        where: { id: { in: targetIds } },
        data: { requireCaptcha: action === 'captchaOn' },
      });
    }

    await recordAudit({
      actor: user,
      action: `bulk.${action}`,
      entity: 'Form',
      summary: `${action} applied to ${targetIds.length} form(s)`,
    });

    revalidatePath('/admin/forms');
    revalidatePath('/', 'layout');
    return success(
      undefined,
      action === 'delete'
        ? `${targetIds.length} form(s) deleted. Existing submissions and leads are retained.`
        : `${targetIds.length} form(s) updated.`,
    );
  } catch (error) {
    return toActionError(error);
  }
}

export async function exportSubmissions(
  input: unknown,
): Promise<ActionResult<{ csv: string; filename: string }>> {
  try {
    const user = await authorize('forms.view');
    const { formId } = exportSchema.parse(input);

    const form = await prisma.form.findUnique({
      where: { id: formId },
      include: { fields: { orderBy: { sortOrder: 'asc' } } },
    });
    if (!form) return failure('That form no longer exists.');

    const submissions = await prisma.formSubmission.findMany({
      where: { formId },
      orderBy: { createdAt: 'desc' },
      take: 5000,
      select: { createdAt: true, data: true, pageUrl: true, referrer: true },
    });

    const columns = form.fields.map((f) => f.name);
    const header = ['submitted_at', ...columns, 'page_url', 'referrer'];
    const rows = submissions.map((submission) => {
      const values = (submission.data ?? {}) as Record<string, unknown>;
      return [
        submission.createdAt.toISOString(),
        ...columns.map((column) => String(values[column] ?? '')),
        submission.pageUrl ?? '',
        submission.referrer ?? '',
      ];
    });

    await recordAudit({
      actor: user,
      action: 'exported',
      entity: 'Form',
      entityId: formId,
      summary: `Exported ${submissions.length} submission(s) from “${form.name}”`,
    });

    return success({
      csv: toCsv([header, ...rows]),
      filename: `${form.slug}-submissions-${new Date().toISOString().slice(0, 10)}.csv`,
    });
  } catch (error) {
    return toActionError(error);
  }
}
