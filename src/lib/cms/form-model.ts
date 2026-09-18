/**
 * Form builder model — shared by the server routes and the client builder.
 *
 * This lives outside the `'use client'` component on purpose. `/admin/forms/new`
 * is a Server Component that needs the starter field factory and the empty-form
 * defaults; importing them from a client module turns them into client
 * references, so calling `newField()` or spreading `EMPTY_FORM` on the server
 * throws and the "New form" route fails before it can render.
 */

import { DEFAULT_FORM_DESIGN, type FormDesign } from '@/lib/forms/form-design';
import { DEFAULT_FIELD_SETTINGS, type FieldSettings } from '@/lib/forms/field-settings';
import { slugify } from '@/lib/utils/slug';

export type BuilderField = {
  /** Stable React key. For a saved field this is its database id. */
  key: string;
  id: string | null;
  type: string;
  label: string;
  name: string;
  placeholder: string;
  helpText: string;
  defaultValue: string;
  isRequired: boolean;
  width: 'full' | 'half';
  options: Array<{ label: string; value: string }>;
  minLength: string;
  maxLength: string;
  pattern: string;
  /** Presentation and state — see FormField in the schema. */
  showLabel: boolean;
  isEnabled: boolean;
  isHidden: boolean;
  isReadOnly: boolean;
  /** Empty means "derive from width", which is what older forms do. */
  colSpan: string;
  cssClass: string;
  settings: FieldSettings;
};

export type FormBuilderValues = {
  id?: string;
  /** The form's own design, edited on the Design tab. */
  design: FormDesign;
  name: string;
  slug: string;
  description: string;
  isActive: boolean;
  submitLabel: string;
  successMessage: string;
  redirectUrl: string;
  leadSource: string;
  /** Empty means the form is shared by every market. */
  countryId: string;
  defaultProductId: string;
  createsLead: boolean;
  notifyEmails: string;
  consentText: string;
  // --- Consent ---------------------------------------------------------------
  /** What authorises processing this form's submissions. */
  lawfulBasis: 'CONSENT' | 'CONTRACT' | 'LEGITIMATE_INTEREST' | 'LEGAL_OBLIGATION';
  /** Off for a form that genuinely collects nothing personal. */
  collectsPersonalData: boolean;
  offerMarketingConsent: boolean;
  requireTermsAcceptance: boolean;
  /** Empty composes the label from the purposes the tick box covers. */
  consentCombinedLabel: string;
  requireCaptcha: boolean;
  fields: BuilderField[];
};

export const FIELD_TYPE_LABELS: Record<string, string> = {
  TIME: 'Time',
  MULTISELECT: 'Multi-select',
  NAME: 'Name',
  EMAIL: 'Email',
  PHONE: 'Phone',
  COMPANY: 'Company',
  TEXT: 'Single line text',
  TEXTAREA: 'Paragraph text',
  NUMBER: 'Number',
  URL: 'Website / URL',
  DATE: 'Date',
  SELECT: 'Dropdown',
  RADIO: 'Radio buttons',
  CHECKBOX: 'Checkbox',
  CONSENT: 'Consent checkbox',
  HIDDEN: 'Hidden value',
};

/** Field types whose values map straight onto Lead columns. */
export const MAPPED_FIELD_TYPES = new Set(['NAME', 'EMAIL', 'PHONE', 'COMPANY', 'TEXTAREA']);

export const CHOICE_FIELD_TYPES = new Set(['SELECT', 'RADIO', 'MULTISELECT', 'CHECKBOX']);

/** Types where a placeholder has no effect, so the control is not offered. */
export const NO_PLACEHOLDER_TYPES = new Set([
  'CHECKBOX',
  'CONSENT',
  'RADIO',
  'DATE',
  'TIME',
  'HIDDEN',
  'MULTISELECT',
]);

/** Types that accept a numeric minimum and maximum. */
export const NUMERIC_FIELD_TYPES = new Set(['NUMBER']);

/**
 * Fields whose controls would be meaningless or unsafe to expose.
 *
 * A hidden field has no label, placeholder or width to configure, and marking
 * one required would block every submission with no way for a visitor to fix
 * it — so the builder does not offer the choice.
 */
export const STRUCTURAL_FIELD_TYPES = new Set(['HIDDEN']);

export const EMPTY_FORM: FormBuilderValues = {
  design: DEFAULT_FORM_DESIGN,
  name: '',
  slug: '',
  description: '',
  isActive: true,
  submitLabel: 'Submit',
  successMessage: 'Thank you. Our team will contact you shortly.',
  redirectUrl: '',
  leadSource: 'Website Form',
  lawfulBasis: 'CONSENT',
  collectsPersonalData: true,
  /*
   * Off, so the defaults are a configuration that can actually be drawn: the
   * default lawful basis is CONSENT, which makes the tick box required, and
   * marketing cannot ride on a required box. An administrator turns it on
   * after choosing a basis that leaves the box optional.
   */
  offerMarketingConsent: false,
  requireTermsAcceptance: false,
  consentCombinedLabel: '',
  countryId: '',
  defaultProductId: '',
  createsLead: true,
  notifyEmails: '',
  consentText: '',
  requireCaptcha: false,
  fields: [],
};

let keyCounter = 0;

/**
 * Unique key for a builder row.
 *
 * Server-rendered starter fields and client-added fields both flow through
 * here, so the counter is combined with a random suffix rather than a
 * timestamp — two fields added in the same millisecond must not collide, and
 * server and client sequences must not overlap after hydration.
 */
export function nextFieldKey(): string {
  keyCounter += 1;
  return `f${keyCounter}-${Math.random().toString(36).slice(2, 9)}`;
}

export function newField(type = 'TEXT'): BuilderField {
  return {
    key: nextFieldKey(),
    id: null,
    type,
    label: FIELD_TYPE_LABELS[type] ?? 'Field',
    name: '',
    placeholder: '',
    helpText: '',
    defaultValue: '',
    isRequired: type === 'EMAIL' || type === 'CONSENT',
    width: type === 'TEXTAREA' || type === 'CONSENT' ? 'full' : 'half',
    options: CHOICE_FIELD_TYPES.has(type) ? [{ label: 'Option one', value: 'option-one' }] : [],
    minLength: '',
    maxLength: '',
    pattern: '',
    showLabel: true,
    isEnabled: true,
    isHidden: type === 'HIDDEN',
    isReadOnly: false,
    colSpan: '',
    cssClass: '',
    settings: DEFAULT_FIELD_SETTINGS,
  };
}

/** The four fields that map onto a lead — the default starting point. */
export function starterFields(): BuilderField[] {
  const labels: Record<string, string> = {
    NAME: 'Full name',
    EMAIL: 'Work email',
    PHONE: 'Phone',
    COMPANY: 'Company',
  };

  return ['NAME', 'EMAIL', 'PHONE', 'COMPANY'].map((type) => {
    const field = newField(type);
    field.name = type.toLowerCase();
    field.label = labels[type]!;
    field.isRequired = type === 'NAME' || type === 'EMAIL';
    return field;
  });
}

/** Machine names key the submission payload, so they must be unique per form. */
export function uniqueFieldName(base: string, fields: BuilderField[]): string {
  const root = base || 'field';
  let candidate = root;
  let n = 1;
  while (fields.some((f) => f.name === candidate)) {
    n += 1;
    candidate = `${root}_${n}`;
  }
  return candidate;
}

/**
 * One builder row, as the save action expects it.
 *
 * It lives here rather than inline in the builder because of what went wrong
 * when it did: the mapping was an allowlist that stopped at `pattern`, so
 * `showLabel`, `isEnabled`, `isHidden`, `isReadOnly`, `colSpan`, `cssClass`
 * and the whole `settings` object were never sent. Every one of them has a
 * default in `formFieldSchema`, so the defaults were filled in and written
 * over the stored values — opening a form and pressing Save without touching
 * anything turned hidden labels back on and discarded per-field settings.
 *
 * Out here it is a pure function with a test (tests/unit/form-payload.test.ts)
 * that round-trips a field through the schema and fails if any property is
 * lost, so the next property added to `BuilderField` cannot go missing quietly.
 */
export function toFieldPayload(field: BuilderField) {
  return {
    id: field.id,
    type: field.type,
    label: field.label,
    name: field.name || slugify(field.label).replace(/-/g, '_'),
    placeholder: field.placeholder || null,
    helpText: field.helpText || null,
    defaultValue: field.defaultValue || null,
    isRequired: field.isRequired,
    width: field.width,
    options: field.options.filter((option) => option.value),
    minLength: field.minLength ? Number(field.minLength) : null,
    maxLength: field.maxLength ? Number(field.maxLength) : null,
    pattern: field.pattern || null,
    showLabel: field.showLabel,
    isEnabled: field.isEnabled,
    isHidden: field.isHidden,
    isReadOnly: field.isReadOnly,
    colSpan: field.colSpan ? Number(field.colSpan) : null,
    cssClass: field.cssClass,
    settings: field.settings,
  };
}
