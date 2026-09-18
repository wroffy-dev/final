import { z } from 'zod';
import { consentSubmissionSchema } from '@/lib/privacy/consent';
import type { PublicFormField } from '@/lib/services/forms';
import { conditionsSatisfied } from '@/lib/forms/field-settings';
import type { FormDesign } from '@/lib/forms/form-design';

/** Attribution captured client-side and posted with every submission. */
export const attributionSchema = z.object({
  utmSource: z.string().max(200).optional().nullable(),
  utmMedium: z.string().max(200).optional().nullable(),
  utmCampaign: z.string().max(200).optional().nullable(),
  utmTerm: z.string().max(200).optional().nullable(),
  utmContent: z.string().max(200).optional().nullable(),
  firstUtmSource: z.string().max(200).optional().nullable(),
  firstUtmMedium: z.string().max(200).optional().nullable(),
  firstUtmCampaign: z.string().max(200).optional().nullable(),
  firstUtmTerm: z.string().max(200).optional().nullable(),
  firstUtmContent: z.string().max(200).optional().nullable(),
  firstLandingUrl: z.string().max(500).optional().nullable(),
  firstTouchAt: z.string().max(40).optional().nullable(),
  referrer: z.string().max(500).optional().nullable(),
  landingUrl: z.string().max(500).optional().nullable(),
  pagePath: z.string().max(500).optional().nullable(),
  ctaLabel: z.string().max(120).optional().nullable(),
  ctaLocation: z.string().max(120).optional().nullable(),
});

export type Attribution = z.infer<typeof attributionSchema>;

export const submissionEnvelopeSchema = z.object({
  formSlug: z.string().min(1).max(120),
  productId: z.string().max(40).optional().nullable(),
  leadMagnetId: z.string().max(40).optional().nullable(),
  /** Honeypot — bots fill it, humans never see it. */
  website: z.string().max(200).optional().nullable(),
  /** Milliseconds between render and submit; sub-second submits are bots. */
  elapsedMs: z.coerce.number().optional().nullable(),
  values: z.record(z.string(), z.union([z.string(), z.array(z.string())])),
  attribution: attributionSchema.optional(),
  /**
   * Math CAPTCHA: the signed challenge the visitor was shown, and their
   * answer. Only present when the form has it switched on. The expected answer
   * is never sent to the browser and never comes back from it — the server
   * recomputes it from the signed token.
   */
  captchaToken: z.string().max(400).optional().nullable(),
  captchaAnswer: z.string().max(10).optional().nullable(),
  /**
   * What the visitor was shown and what they ticked.
   *
   * Only ever evidence. What the form *requires* is re-read from the database
   * on every submission, so omitting this object entirely — as a crafted
   * request would — fails the requirement rather than skipping it.
   */
  consent: consentSubmissionSchema.optional(),
});

export type SubmissionEnvelope = z.infer<typeof submissionEnvelopeSchema>;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;
const PHONE_RE = /^[+\d][\d\s().-]{5,24}$/;

/**
 * Which fields a submission is actually judged against.
 *
 * A field is skipped when the visitor could not have answered it: it is
 * read-only, it is marked hidden, it is a system field carrying injected
 * context, or its conditions are not met by the submitted values. All four
 * matter for the same reason — requiring an answer to a question that was never
 * asked rejects legitimate submissions, and accepting one trusts a value the
 * form never offered.
 *
 * Conditions are evaluated here, on the server, against the payload, never
 * taken from the client's opinion of what was visible. The caller then
 * substitutes the admin's configured default for each skipped field, so a
 * crafted payload cannot rewrite one.
 *
 * `HIDDEN`-type fields are deliberately left in: they predate these flags and
 * are filled by page scripts today, so taking their value from the server
 * instead would change behaviour that forms already depend on.
 */
export function activeFields(fields: PublicFormField[], values: Record<string, unknown>) {
  const known = new Set(fields.map((field) => field.name));
  return fields.filter(
    (field) =>
      !field.isReadOnly &&
      !field.isHidden &&
      !field.settings.system &&
      conditionsSatisfied(field.settings, values, known),
  );
}

/** The message an admin configured, falling back to the built-in wording. */
function messageFor(
  field: PublicFormField,
  kind: 'required' | 'invalid',
  fallback: string,
  design?: FormDesign,
): string {
  if (kind === 'required') {
    if (field.settings.requiredMessage) return field.settings.requiredMessage;
    if (design?.validation.requiredMessage) return design.validation.requiredMessage;
    return fallback;
  }
  if (field.settings.invalidMessage) return field.settings.invalidMessage;
  if (field.type === 'EMAIL' && design?.validation.emailMessage) {
    return design.validation.emailMessage;
  }
  if (field.type === 'PHONE' && design?.validation.phoneMessage) {
    return design.validation.phoneMessage;
  }
  if (field.type === 'URL' && design?.validation.urlMessage) return design.validation.urlMessage;
  return fallback;
}

/**
 * Builds a Zod schema from the admin-configured field definitions, so the
 * server enforces exactly the rules the admin set — never the client's copy.
 */
export function buildFieldSchema(
  fields: PublicFormField[],
  design?: FormDesign,
): z.ZodType<Record<string, unknown>> {
  const shape: Record<string, z.ZodTypeAny> = {};

  for (const field of fields) {
    let rule: z.ZodTypeAny;

    switch (field.type) {
      // A consent box is a single yes/no the visitor must actively tick when it
      // is required — it never carries multiple values like a checkbox group.
      case 'CONSENT': {
        rule = z
          .union([z.string(), z.array(z.string())])
          .transform((v) => (Array.isArray(v) ? (v.length > 0 ? 'true' : '') : v));
        if (field.isRequired) {
          rule = rule.refine((v) => v === 'true' || v === 'on' || v === 'checked', {
            message: messageFor(field, 'required', `${field.label} must be accepted`, design),
          });
        }
        shape[field.name] = rule.optional();
        continue;
      }

      case 'CHECKBOX':
        rule = z
          .union([z.string(), z.array(z.string())])
          .transform((v) => (Array.isArray(v) ? v.join(', ') : v));
        if (field.isRequired) {
          rule = rule.refine((v) => Boolean(v && v !== 'false'), {
            message: messageFor(field, 'required', `${field.label} is required`, design),
          });
        }
        shape[field.name] = rule.optional();
        continue;

      // A multi-select posts one value per chosen option. Each is checked
      // against the admin's option list, so a tampered payload cannot smuggle
      // in a value the form never offered.
      case 'MULTISELECT': {
        const allowed = field.options.map((o) => o.value);
        rule = z
          .union([z.string(), z.array(z.string())])
          .transform((v) => (Array.isArray(v) ? v : v ? [v] : []))
          .refine(
            (list) => allowed.length === 0 || list.every((value) => allowed.includes(value)),
            { message: messageFor(field, 'invalid', 'Choose from the available options', design) },
          )
          .transform((list) => list.join(', '));
        if (field.isRequired) {
          rule = rule.refine((v) => Boolean(v), {
            message: messageFor(field, 'required', `${field.label} is required`, design),
          });
        }
        shape[field.name] = field.isRequired ? rule : rule.optional();
        continue;
      }

      case 'EMAIL': {
        let s = z.string().trim().max(320);
        s = s.refine((v) => !v || EMAIL_RE.test(v), {
          message: messageFor(field, 'invalid', 'Enter a valid email address', design),
        });
        rule = s;
        break;
      }

      case 'PHONE': {
        let s = z.string().trim().max(30);
        s = s.refine((v) => !v || PHONE_RE.test(v), {
          message: messageFor(field, 'invalid', 'Enter a valid phone number', design),
        });
        rule = s;
        break;
      }

      case 'NUMBER': {
        const { min, max } = field.settings;
        rule = z
          .string()
          .trim()
          .max(20)
          .refine((v) => !v || /^-?\d+(\.\d+)?$/.test(v), {
            message: messageFor(field, 'invalid', 'Enter a number', design),
          })
          .refine((v) => !v || min === null || Number(v) >= min, {
            message: `${field.label} must be ${min} or more`,
          })
          .refine((v) => !v || max === null || Number(v) <= max, {
            message: `${field.label} must be ${max} or less`,
          });
        break;
      }

      case 'SELECT':
      case 'RADIO': {
        const allowed = field.options.map((o) => o.value);
        rule = z
          .string()
          .trim()
          .refine((v) => !v || allowed.length === 0 || allowed.includes(v), {
            message: messageFor(field, 'invalid', 'Choose one of the available options', design),
          });
        break;
      }

      case 'URL': {
        rule = z
          .string()
          .trim()
          .max(500)
          .refine((v) => !v || /^(https?:\/\/)?[\w.-]+\.[a-z]{2,}([/?#].*)?$/i.test(v), {
            message: messageFor(field, 'invalid', 'Enter a valid web address', design),
          });
        break;
      }

      case 'DATE': {
        rule = z
          .string()
          .trim()
          .max(10)
          .refine((v) => !v || /^\d{4}-\d{2}-\d{2}$/.test(v), {
            message: messageFor(field, 'invalid', 'Choose a date', design),
          });
        break;
      }

      case 'TIME': {
        rule = z
          .string()
          .trim()
          .max(5)
          .refine((v) => !v || /^([01]\d|2[0-3]):[0-5]\d$/.test(v), {
            message: messageFor(field, 'invalid', 'Choose a time', design),
          });
        break;
      }

      case 'TEXTAREA':
        rule = z
          .string()
          .trim()
          .max(field.maxLength ?? 5000);
        break;

      default:
        rule = z
          .string()
          .trim()
          .max(field.maxLength ?? 500);
    }

    let stringRule = rule as z.ZodType<string>;

    if (field.minLength) {
      stringRule = stringRule.refine((v) => !v || v.length >= field.minLength!, {
        message: messageFor(
          field,
          'invalid',
          `${field.label} must be at least ${field.minLength} characters`,
          design,
        ),
      });
    }
    if (field.pattern) {
      const pattern = field.pattern;
      stringRule = stringRule.refine(
        (v) => {
          if (!v) return true;
          try {
            return new RegExp(pattern).test(v);
          } catch {
            return true; // an invalid stored pattern must not block submissions
          }
        },
        {
          message: messageFor(
            field,
            'invalid',
            `${field.label} is not in the expected format`,
            design,
          ),
        },
      );
    }
    if (field.isRequired) {
      stringRule = stringRule.refine((v) => Boolean(v && v.trim()), {
        message: messageFor(field, 'required', `${field.label} is required`, design),
      });
      shape[field.name] = stringRule;
    } else {
      shape[field.name] = stringRule.optional().default('');
    }
  }

  return z.object(shape).passthrough() as unknown as z.ZodType<Record<string, unknown>>;
}

/** Maps well-known field names onto Lead columns. */
export function extractLeadCore(values: Record<string, unknown>, fields: PublicFormField[]) {
  const get = (predicate: (f: PublicFormField) => boolean): string => {
    const field = fields.find(predicate);
    if (!field) return '';
    const value = values[field.name];
    return typeof value === 'string' ? value.trim() : '';
  };

  const name =
    get((f) => f.type === 'NAME') ||
    get((f) => /^(full_?name|name)$/i.test(f.name)) ||
    [get((f) => /first_?name/i.test(f.name)), get((f) => /last_?name/i.test(f.name))]
      .filter(Boolean)
      .join(' ');

  const email = get((f) => f.type === 'EMAIL') || get((f) => /email/i.test(f.name));
  const phone = get((f) => f.type === 'PHONE') || get((f) => /phone|mobile/i.test(f.name));
  const company =
    get((f) => f.type === 'COMPANY') ||
    get((f) => /company|organisation|organization/i.test(f.name));
  const jobTitle = get((f) => /job_?title|designation|role/i.test(f.name));
  const message =
    get((f) => f.type === 'TEXTAREA') || get((f) => /message|comments|requirement/i.test(f.name));

  return { name, email, phone, company, jobTitle, message };
}
