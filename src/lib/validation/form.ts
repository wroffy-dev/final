import { z } from 'zod';
import { slugify } from '@/lib/utils/slug';
import { formDesignSchema } from '@/lib/forms/form-design';
import { fieldSettingsSchema, sanitiseCssClass } from '@/lib/forms/field-settings';

const optional = (max: number) =>
  z
    .string()
    .max(max)
    .transform((v) => v.trim())
    .optional()
    .nullable()
    .transform((v) => (v ? v : null));

export const formFieldTypes = [
  'NAME',
  'EMAIL',
  'PHONE',
  'COMPANY',
  'TEXT',
  'TEXTAREA',
  'NUMBER',
  'URL',
  'DATE',
  'TIME',
  'SELECT',
  'MULTISELECT',
  'RADIO',
  'CHECKBOX',
  'CONSENT',
  'HIDDEN',
] as const;

export const formFieldSchema = z.object({
  id: z.string().optional().nullable(),
  type: z.enum(formFieldTypes),
  label: z.string().trim().min(1, 'Every field needs a label').max(160),
  // Machine key used as the submission key and the lead mapping hint.
  name: z
    .string()
    .max(60)
    .transform((v) =>
      v
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9_]+/g, '_')
        .replace(/^_+|_+$/g, ''),
    ),
  placeholder: optional(160),
  helpText: optional(200),
  defaultValue: optional(200),
  isRequired: z.boolean().default(false),
  width: z.enum(['full', 'half']).default('full'),
  options: z
    .array(z.object({ label: z.string().max(120), value: z.string().max(120) }))
    .max(50)
    .default([]),
  minLength: z.number().int().min(0).max(5000).nullable().optional(),
  maxLength: z.number().int().min(1).max(20000).nullable().optional(),
  pattern: optional(200),

  // Presentation and state. Each default matches how a field behaved before
  // these existed, so a payload from an older client cannot change one.
  showLabel: z.boolean().default(true),
  isEnabled: z.boolean().default(true),
  isHidden: z.boolean().default(false),
  isReadOnly: z.boolean().default(false),
  colSpan: z.number().int().min(1).max(4).nullable().optional(),
  // Sanitised rather than rejected: an admin pasting a class list with a stray
  // character should get the usable part, not a failed save.
  cssClass: z.preprocess(sanitiseCssClass, z.string().max(200)).default(''),
  settings: fieldSettingsSchema.optional(),
});

export const formInputSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(160),
  /**
   * The market this form belongs to, or null for a form shared by every
   * market — which is what every form built before markets existed is, and
   * what the default remains.
   */
  countryId: optional(40),
  slug: z
    .string()
    .max(160)
    .transform((v) => slugify(v)),
  description: optional(500),
  isActive: z.boolean().default(true),
  submitLabel: z.string().trim().min(1).max(60).default('Submit'),
  successMessage: z.string().trim().min(1).max(600).default('Thank you.'),
  redirectUrl: optional(500),
  leadSource: optional(120),
  defaultProductId: optional(40),
  createsLead: z.boolean().default(true),
  notifyEmails: optional(500),
  consentText: optional(600),
  lawfulBasis: z
    .enum(['CONSENT', 'CONTRACT', 'LEGITIMATE_INTEREST', 'LEGAL_OBLIGATION'])
    .default('CONSENT'),
  collectsPersonalData: z.boolean().default(true),
  /*
   * Off by default, like `requireCaptcha` below and for the same reason: a
   * payload that does not mention marketing must not switch it on. It is also
   * the only default that is valid on its own — the default lawful basis is
   * CONSENT, which makes the tick box required, and marketing cannot ride on a
   * required box. Defaulting to true would make every payload that omits these
   * settings fail the very check below.
   */
  offerMarketingConsent: z.boolean().default(false),
  requireTermsAcceptance: z.boolean().default(false),
  /**
   * The wording beside this form's one tick box. Empty means "compose it from
   * the purposes the box covers", which is what every form that has never been
   * given a label does.
   */
  consentCombinedLabel: optional(600),
  // Defaults to false so a payload from an older client — or an existing form
  // saved before this existed — never silently switches the CAPTCHA on.
  requireCaptcha: z.boolean().default(false),
  /**
   * Presentation. Optional, so a payload that omits it — an older client, or a
   * script that only means to rename a form — leaves the stored design alone
   * rather than resetting it to defaults.
   */
  design: formDesignSchema.optional(),
  fields: z.array(formFieldSchema).max(40).default([]),
});

export type FormInput = z.infer<typeof formInputSchema>;

/** Field names must be unique within a form — they key the submission payload. */
export function duplicateFieldNames(fields: Array<{ name: string }>): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const field of fields) {
    if (seen.has(field.name)) duplicates.add(field.name);
    seen.add(field.name);
  }
  return Array.from(duplicates);
}
