import { z } from 'zod';

/**
 * Per-field settings that live in `FormField.settings`.
 *
 * These are the options that are read only when a field is rendered or
 * validated and are never queried, so they belong in one JSON column rather
 * than twenty nullable ones. The flags the renderer and the validator branch on
 * — enabled, hidden, required, read-only — are real columns instead, because
 * those decide whether a value is accepted at all.
 *
 * Every default reproduces the behaviour a field had before this existed.
 */

const CONDITION_OPERATORS = [
  'equals',
  'not_equals',
  'contains',
  'is_empty',
  'is_not_empty',
] as const;

export type ConditionOperator = (typeof CONDITION_OPERATORS)[number];

export const CONDITION_OPERATOR_LABELS: Record<ConditionOperator, string> = {
  equals: 'is',
  not_equals: 'is not',
  contains: 'contains',
  is_empty: 'is empty',
  is_not_empty: 'is not empty',
};

/** Operators that take no value — the value input is hidden for these. */
export const VALUELESS_OPERATORS: ReadonlySet<string> = new Set(['is_empty', 'is_not_empty']);

const condition = z.object({
  /** Machine name of the field being tested. */
  field: z.string().trim().max(60).catch('').default(''),
  operator: z.enum(CONDITION_OPERATORS).catch('equals').default('equals'),
  value: z.string().trim().max(200).catch('').default(''),
});

export type FieldCondition = z.infer<typeof condition>;

export const fieldSettingsSchema = z.object({
  /**
   * Conditional visibility. One flat list joined by a single operator — not a
   * nested rules engine. That covers "show Company Size when Product Interest
   * is Dropbox Business", which is the actual requirement, without building a
   * tree nobody can debug from an admin screen.
   */
  conditions: z.array(condition).max(5).catch([]).default([]),
  conditionMatch: z.enum(['all', 'any']).catch('all').default('all'),

  // Validation beyond the min/max length columns.
  min: z.coerce.number().nullable().catch(null).default(null),
  max: z.coerce.number().nullable().catch(null).default(null),

  /** Overrides the form-level default message for this field. */
  requiredMessage: z.string().trim().max(160).catch('').default(''),
  invalidMessage: z.string().trim().max(160).catch('').default(''),

  // Textarea
  rows: z.coerce.number().int().min(2).max(20).nullable().catch(null).default(null),

  // Choice fields
  choiceLayout: z.enum(['inherit', 'vertical', 'horizontal', 'grid']).catch('inherit').default('inherit'),
  /** SELECT only: the text of the empty first option. */
  emptyOptionLabel: z.string().trim().max(120).catch('').default(''),

  /** Overrides the form-level label position for this one field. */
  labelPosition: z.enum(['inherit', 'top', 'left', 'floating']).catch('inherit').default('inherit'),

  /** Marks a field as owned by the system (product id, plan, SKU). */
  system: z.coerce.boolean().catch(false).default(false),
});

export type FieldSettings = z.infer<typeof fieldSettingsSchema>;

export const DEFAULT_FIELD_SETTINGS: FieldSettings = fieldSettingsSchema.parse({});

export function parseFieldSettings(raw: unknown): FieldSettings {
  if (!raw || typeof raw !== 'object') return DEFAULT_FIELD_SETTINGS;
  const result = fieldSettingsSchema.safeParse(raw);
  return result.success ? result.data : DEFAULT_FIELD_SETTINGS;
}

/**
 * Sanitises an admin-entered class list.
 *
 * The result is interpolated into a `class` attribute, so anything that could
 * close the attribute or start a new one has to go. Tokens are restricted to
 * what a CSS class may actually contain, capped in number and length.
 */
export function sanitiseCssClass(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  return raw
    .split(/\s+/)
    .map((token) => token.replace(/[^a-zA-Z0-9_:\-[\]/.]/g, ''))
    .filter((token) => token.length > 0 && token.length <= 40)
    .slice(0, 8)
    .join(' ');
}

// ---------------------------------------------------------------------------
// Conditional visibility
// ---------------------------------------------------------------------------

function asText(value: unknown): string {
  if (Array.isArray(value)) return value.join(', ');
  if (value === null || value === undefined) return '';
  return String(value);
}

/** Evaluates one condition against the current values. Case-insensitive. */
function matches(condition: FieldCondition, values: Record<string, unknown>): boolean {
  const actual = asText(values[condition.field]).trim().toLowerCase();
  const expected = condition.value.trim().toLowerCase();

  switch (condition.operator) {
    case 'equals':
      return actual === expected;
    case 'not_equals':
      return actual !== expected;
    case 'contains':
      return expected !== '' && actual.includes(expected);
    case 'is_empty':
      return actual === '';
    case 'is_not_empty':
      return actual !== '';
    default:
      return true;
  }
}

/**
 * Whether a field's conditions are currently satisfied.
 *
 * Used by the renderer to decide what to draw and — this is the part that
 * matters — by the server to decide what to validate. A field the visitor never
 * saw must not be required of them, and a value for a field whose conditions
 * are not met must not be trusted just because it arrived in the payload.
 *
 * A condition naming a field that does not exist is ignored rather than
 * treated as failed: a renamed field should not silently hide a question.
 */
export function conditionsSatisfied(
  settings: FieldSettings,
  values: Record<string, unknown>,
  knownFieldNames: ReadonlySet<string>,
): boolean {
  const active = settings.conditions.filter(
    (condition) => condition.field && knownFieldNames.has(condition.field),
  );
  if (active.length === 0) return true;

  return settings.conditionMatch === 'any'
    ? active.some((condition) => matches(condition, values))
    : active.every((condition) => matches(condition, values));
}
