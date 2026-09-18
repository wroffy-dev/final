import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { mockAuth, uniqueSuffix } from '../helpers';

mockAuth();

const { prisma } = await import('@/lib/db/prisma');
const { submitForm } = await import('@/lib/actions/submit-form');
const { saveForm } = await import('@/lib/actions/forms');
const { getPublicForm } = await import('@/lib/services/forms');
const { activeFields, buildFieldSchema } = await import('@/lib/validation/form-submission');
const { __resetRateLimits } = await import('@/lib/utils/rate-limit');
const { parseFormDesign, DEFAULT_FORM_DESIGN } = await import('@/lib/forms/form-design');

const suffix = uniqueSuffix();
const createdFormIds: string[] = [];

type FieldSeed = {
  type: string;
  label: string;
  name: string;
  isRequired?: boolean;
  isEnabled?: boolean;
  isHidden?: boolean;
  isReadOnly?: boolean;
  showLabel?: boolean;
  colSpan?: number | null;
  cssClass?: string | null;
  defaultValue?: string | null;
  options?: Array<{ label: string; value: string }>;
  settings?: Record<string, unknown>;
};

async function makeForm(slug: string, fields: FieldSeed[], design?: Record<string, unknown>) {
  const form = await prisma.form.create({
    data: {
      name: slug,
      slug,
      isActive: true,
      createsLead: false,
      design: (design ?? undefined) as never,
      fields: {
        create: fields.map((field, index) => ({
          type: field.type as never,
          label: field.label,
          name: field.name,
          isRequired: field.isRequired ?? false,
          isEnabled: field.isEnabled ?? true,
          isHidden: field.isHidden ?? false,
          isReadOnly: field.isReadOnly ?? false,
          showLabel: field.showLabel ?? true,
          colSpan: field.colSpan ?? null,
          cssClass: field.cssClass ?? null,
          defaultValue: field.defaultValue ?? null,
          options: (field.options ?? []) as never,
          settings: (field.settings ?? undefined) as never,
          sortOrder: index * 10,
          width: 'full',
        })),
      },
    },
  });
  createdFormIds.push(form.id);
  return form;
}

/** A submission that clears the spam gates, so only validation is under test. */
function envelope(slug: string, values: Record<string, string | string[]>) {
  return {
    /*
     * Every form now asks for consent, so a submission that omits it is
     * rejected — which is the point. The helper ticks the required box so
     * these tests keep testing what they are about.
     */
    consent: { enquiry: true, marketing: false, terms: false }, formSlug: slug, elapsedMs: 5000, values };
}

beforeEach(() => {
  __resetRateLimits();
});

afterAll(async () => {
  await prisma.formSubmission.deleteMany({ where: { formId: { in: createdFormIds } } });
  await prisma.form.deleteMany({ where: { id: { in: createdFormIds } } });
});

describe('existing forms are untouched', () => {
  it('reads a form with no stored design as the defaults', async () => {
    const slug = `legacy-${suffix}`;
    await makeForm(slug, [{ type: 'EMAIL', label: 'Email', name: 'email', isRequired: true }]);

    const form = await getPublicForm(slug);

    expect(form).not.toBeNull();
    expect(form!.design).toEqual(DEFAULT_FORM_DESIGN);
  });

  it('gives every field the behaviour it had before these columns existed', async () => {
    const slug = `legacy-fields-${suffix}`;
    await makeForm(slug, [{ type: 'TEXT', label: 'Note', name: 'note' }]);

    const field = (await getPublicForm(slug))!.fields[0]!;

    expect(field.showLabel).toBe(true);
    expect(field.isHidden).toBe(false);
    expect(field.isReadOnly).toBe(false);
    expect(field.colSpan).toBeNull();
    expect(field.settings.conditions).toEqual([]);
  });

  it('still accepts a submission exactly as before', async () => {
    const slug = `legacy-submit-${suffix}`;
    await makeForm(slug, [
      { type: 'NAME', label: 'Name', name: 'name', isRequired: true },
      { type: 'EMAIL', label: 'Email', name: 'email', isRequired: true },
    ]);

    const result = await submitForm(
      envelope(slug, { name: 'Asha', email: 'asha@example.test' }),
    );

    expect(result.ok).toBe(true);
  });
});

describe('disabled fields', () => {
  it('are removed from the form entirely', async () => {
    const slug = `disabled-${suffix}`;
    await makeForm(slug, [
      { type: 'EMAIL', label: 'Email', name: 'email', isRequired: true },
      { type: 'TEXT', label: 'Retired', name: 'retired', isEnabled: false, isRequired: true },
    ]);

    const form = await getPublicForm(slug);

    expect(form!.fields.map((f) => f.name)).toEqual(['email']);
  });

  /**
   * A disabled field that was still required would otherwise make the form
   * permanently unsubmittable, with no visible field to fix.
   */
  it('cannot block a submission by still being required', async () => {
    const slug = `disabled-required-${suffix}`;
    await makeForm(slug, [
      { type: 'EMAIL', label: 'Email', name: 'email', isRequired: true },
      { type: 'TEXT', label: 'Retired', name: 'retired', isEnabled: false, isRequired: true },
    ]);

    const result = await submitForm(envelope(slug, { email: 'a@example.test' }));

    expect(result.ok).toBe(true);
  });
});

describe('read-only, hidden and system fields', () => {
  it('records the configured value, not the one submitted', async () => {
    const slug = `readonly-${suffix}`;
    const form = await makeForm(slug, [
      { type: 'EMAIL', label: 'Email', name: 'email', isRequired: true },
      { type: 'TEXT', label: 'Tier', name: 'tier', isReadOnly: true, defaultValue: 'standard' },
      { type: 'TEXT', label: 'Ref', name: 'ref', isHidden: true, defaultValue: 'web' },
    ]);

    const result = await submitForm(
      envelope(slug, {
        email: 'a@example.test',
        // What an attacker would send.
        tier: 'enterprise-free',
        ref: 'tampered',
      }),
    );
    expect(result.ok).toBe(true);

    const submission = await prisma.formSubmission.findFirst({
      where: { formId: form.id },
      orderBy: { createdAt: 'desc' },
    });
    const data = submission!.data as Record<string, string>;

    expect(data.tier).toBe('standard');
    expect(data.ref).toBe('web');
  });

  it('does not require a read-only or hidden field the visitor never filled', async () => {
    const slug = `readonly-required-${suffix}`;
    await makeForm(slug, [
      { type: 'EMAIL', label: 'Email', name: 'email', isRequired: true },
      { type: 'TEXT', label: 'Tier', name: 'tier', isReadOnly: true, isRequired: true },
    ]);

    const result = await submitForm(envelope(slug, { email: 'a@example.test' }));

    expect(result.ok).toBe(true);
  });

  /**
   * The §22 guarantee: a form may carry product context without that becoming a
   * way to claim the enquiry was about a different product.
   */
  it('resolves a system field from the trusted product id, ignoring the payload', async () => {
    const product = await prisma.product.findFirst({
      where: { deletedAt: null },
      select: { id: true, name: true },
    });
    if (!product) return; // no seeded products in this database

    const slug = `system-${suffix}`;
    const form = await makeForm(slug, [
      { type: 'EMAIL', label: 'Email', name: 'email', isRequired: true },
      {
        type: 'TEXT',
        label: 'Product',
        name: 'product_name',
        isReadOnly: true,
        settings: { system: true },
      },
    ]);

    const result = await submitForm({
      consent: { enquiry: true, marketing: false, terms: false },
      formSlug: slug,
      elapsedMs: 5000,
      productId: product.id,
      values: { email: 'a@example.test', product_name: 'Something Else Entirely' },
    });
    expect(result.ok).toBe(true);

    const submission = await prisma.formSubmission.findFirst({
      where: { formId: form.id },
      orderBy: { createdAt: 'desc' },
    });
    const data = submission!.data as Record<string, string>;

    expect(data.product_name).toBe(product.name);
  });
});

describe('conditional fields', () => {
  const conditionalSeed: FieldSeed[] = [
    { type: 'EMAIL', label: 'Email', name: 'email', isRequired: true },
    {
      type: 'SELECT',
      label: 'Interest',
      name: 'interest',
      options: [
        { label: 'Business', value: 'business' },
        { label: 'Enterprise', value: 'enterprise' },
      ],
    },
    {
      type: 'TEXT',
      label: 'Company size',
      name: 'company_size',
      isRequired: true,
      settings: {
        conditions: [{ field: 'interest', operator: 'equals', value: 'business' }],
      },
    },
  ];

  it('does not require a field whose condition is unmet', async () => {
    const slug = `cond-skip-${suffix}`;
    await makeForm(slug, conditionalSeed);

    const result = await submitForm(
      envelope(slug, { email: 'a@example.test', interest: 'enterprise' }),
    );

    expect(result.ok).toBe(true);
  });

  it('requires it once the condition is met', async () => {
    const slug = `cond-require-${suffix}`;
    await makeForm(slug, conditionalSeed);

    const result = await submitForm(
      envelope(slug, { email: 'a@example.test', interest: 'business' }),
    );

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.fieldErrors?.company_size).toBeTruthy();
  });

  it('accepts it when the condition is met and it is answered', async () => {
    const slug = `cond-ok-${suffix}`;
    await makeForm(slug, conditionalSeed);

    const result = await submitForm(
      envelope(slug, { email: 'a@example.test', interest: 'business', company_size: '50-100' }),
    );

    expect(result.ok).toBe(true);
  });

  /**
   * Visibility is decided on the server from the payload, so sending a value
   * for a hidden field does not smuggle it into the record.
   */
  it('discards a value sent for a field whose condition is unmet', async () => {
    const slug = `cond-discard-${suffix}`;
    const form = await makeForm(slug, conditionalSeed);

    await submitForm(
      envelope(slug, {
        email: 'a@example.test',
        interest: 'enterprise',
        company_size: 'injected',
      }),
    );

    const submission = await prisma.formSubmission.findFirst({
      where: { formId: form.id },
      orderBy: { createdAt: 'desc' },
    });
    const data = submission!.data as Record<string, string>;

    expect(data.company_size).toBe('');
  });

  it('resolves which fields are judged without touching the database', async () => {
    const slug = `cond-unit-${suffix}`;
    await makeForm(slug, conditionalSeed);
    const form = (await getPublicForm(slug))!;

    const withBusiness = activeFields(form.fields, { interest: 'business' });
    const withEnterprise = activeFields(form.fields, { interest: 'enterprise' });

    expect(withBusiness.map((f) => f.name)).toContain('company_size');
    expect(withEnterprise.map((f) => f.name)).not.toContain('company_size');
  });
});

describe('validation rules', () => {
  it('enforces a numeric minimum and maximum', async () => {
    const slug = `num-${suffix}`;
    await makeForm(slug, [
      { type: 'EMAIL', label: 'Email', name: 'email', isRequired: true },
      {
        type: 'NUMBER',
        label: 'Seats',
        name: 'seats',
        settings: { min: 5, max: 500 },
      },
    ]);

    expect((await submitForm(envelope(slug, { email: 'a@b.test', seats: '2' }))).ok).toBe(false);
    __resetRateLimits();
    expect((await submitForm(envelope(slug, { email: 'a@b.test', seats: '900' }))).ok).toBe(false);
    __resetRateLimits();
    expect((await submitForm(envelope(slug, { email: 'a@b.test', seats: '50' }))).ok).toBe(true);
  });

  it('uses the admin message for a required field', async () => {
    const slug = `msg-field-${suffix}`;
    await makeForm(slug, [
      {
        type: 'TEXT',
        label: 'Name',
        name: 'name',
        isRequired: true,
        settings: { requiredMessage: 'We need your name to reply.' },
      },
    ]);

    const result = await submitForm(envelope(slug, { name: '' }));

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.fieldErrors?.name?.[0]).toBe('We need your name to reply.');
  });

  it("falls back to the form's default message", async () => {
    const slug = `msg-form-${suffix}`;
    await makeForm(
      slug,
      [{ type: 'TEXT', label: 'Name', name: 'name', isRequired: true }],
      { validation: { requiredMessage: 'Required, please.' } },
    );

    const result = await submitForm(envelope(slug, { name: '' }));

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.fieldErrors?.name?.[0]).toBe('Required, please.');
  });

  it('uses a per-field message in preference to the form default', async () => {
    const slug = `msg-both-${suffix}`;
    await makeForm(
      slug,
      [
        {
          type: 'EMAIL',
          label: 'Email',
          name: 'email',
          isRequired: true,
          settings: { invalidMessage: 'That address looks wrong.' },
        },
      ],
      { validation: { emailMessage: 'Form-level email message.' } },
    );

    const result = await submitForm(envelope(slug, { email: 'not-an-email' }));

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.fieldErrors?.email?.[0]).toBe('That address looks wrong.');
  });

  it('validates a multi-select against the offered options', async () => {
    const slug = `multi-${suffix}`;
    await makeForm(slug, [
      { type: 'EMAIL', label: 'Email', name: 'email', isRequired: true },
      {
        type: 'MULTISELECT',
        label: 'Products',
        name: 'products',
        options: [
          { label: 'Standard', value: 'standard' },
          { label: 'Advanced', value: 'advanced' },
        ],
      },
    ]);

    const bad = await submitForm(
      envelope(slug, { email: 'a@b.test', products: ['standard', 'free-forever'] }),
    );
    expect(bad.ok).toBe(false);

    __resetRateLimits();
    const good = await submitForm(
      envelope(slug, { email: 'a@b.test', products: ['standard', 'advanced'] }),
    );
    expect(good.ok).toBe(true);
  });

  it('validates a time field', async () => {
    const slug = `time-${suffix}`;
    await makeForm(slug, [
      { type: 'EMAIL', label: 'Email', name: 'email', isRequired: true },
      { type: 'TIME', label: 'Preferred time', name: 'slot' },
    ]);

    expect((await submitForm(envelope(slug, { email: 'a@b.test', slot: '99:99' }))).ok).toBe(false);
    __resetRateLimits();
    expect((await submitForm(envelope(slug, { email: 'a@b.test', slot: '14:30' }))).ok).toBe(true);
  });

  it('rebuilds the schema from stored definitions, not the client payload', async () => {
    const slug = `authoritative-${suffix}`;
    await makeForm(slug, [{ type: 'EMAIL', label: 'Email', name: 'email', isRequired: true }]);
    const form = (await getPublicForm(slug))!;

    const schema = buildFieldSchema(form.fields, form.design);

    // A payload claiming the field is optional changes nothing.
    expect(schema.safeParse({ email: '' }).success).toBe(false);
    expect(schema.safeParse({ email: 'a@b.test' }).success).toBe(true);
  });
});

describe('saving a design', () => {
  it('round-trips a design through the admin save path', async () => {
    const slug = `save-design-${suffix}`;
    const created = await makeForm(slug, [
      { type: 'EMAIL', label: 'Email', name: 'email', isRequired: true },
    ]);

    const result = await saveForm(created.id, {
      name: slug,
      slug,
      submitLabel: 'Send enquiry',
      successMessage: 'Thanks.',
      design: {
        desktop: { columns: 3, rowGap: '24px' },
        button: { align: 'center', background: '#0061FF' },
      },
      fields: [
        {
          id: created.id ? undefined : undefined,
          type: 'EMAIL',
          label: 'Email',
          name: 'email',
          isRequired: true,
          showLabel: false,
          colSpan: 2,
          cssClass: 'wide" onmouseover="alert(1)',
          settings: { conditions: [], requiredMessage: 'Email please.' },
        },
      ],
    });

    expect(result.ok).toBe(true);

    const form = (await prisma.form.findUnique({
      where: { id: created.id },
      include: { fields: true },
    }))!;

    const design = parseFormDesign(form.design);
    expect(design.desktop.columns).toBe(3);
    expect(design.desktop.rowGap).toBe('24px');
    expect(design.button.align).toBe('center');

    const field = form.fields[0]!;
    expect(field.showLabel).toBe(false);
    expect(field.colSpan).toBe(2);
    // The property that matters is that nothing stored here can break out of
    // the class attribute: no quotes, no equals sign, no angle brackets. What
    // survives ("wide onmouseoveralert1") is an inert class name, not an
    // event handler.
    for (const char of ['"', "'", '=', '<', '>', '(', ')', ' onmouseover=']) {
      expect(field.cssClass).not.toContain(char);
    }
    expect(field.cssClass).toContain('wide');
  });

  it('leaves a stored design alone when the payload omits it', async () => {
    const slug = `preserve-design-${suffix}`;
    const created = await makeForm(
      slug,
      [{ type: 'EMAIL', label: 'Email', name: 'email' }],
      { desktop: { columns: 4 } },
    );

    await saveForm(created.id, {
      name: `${slug} renamed`,
      slug,
      submitLabel: 'Submit',
      successMessage: 'Thanks.',
      fields: [{ type: 'EMAIL', label: 'Email', name: 'email' }],
    });

    const form = (await prisma.form.findUnique({ where: { id: created.id } }))!;
    expect(parseFormDesign(form.design).desktop.columns).toBe(4);
  });
});

describe('consent settings a form cannot hold', () => {
  const base = (slug: string) => ({
    name: slug,
    slug,
    submitLabel: 'Send',
    successMessage: 'Thanks.',
    collectsPersonalData: true,
    fields: [{ type: 'EMAIL' as const, label: 'Email', name: 'email', isRequired: true }],
  });

  it('refuses to bundle optional marketing into a box the visitor must tick', async () => {
    const slug = `mk-consent-${suffix}`;
    const result = await saveForm(null, {
      ...base(slug),
      lawfulBasis: 'CONSENT',
      offerMarketingConsent: true,
      requireTermsAcceptance: false,
    });

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error).toMatch(/marketing a condition of submitting/i);
    // The message names the switch to change, so the administrator is not left
    // guessing which of the three settings is the problem.
    expect(result.ok === false && result.fieldErrors?.offerMarketingConsent?.[0]).toMatch(
      /Offer marketing consent in the tick box/,
    );
    expect(await prisma.form.count({ where: { slug } })).toBe(0);
  });

  it('refuses the same when Terms acceptance is what makes the box required', async () => {
    const slug = `mk-terms-${suffix}`;
    const result = await saveForm(null, {
      ...base(slug),
      lawfulBasis: 'LEGITIMATE_INTEREST',
      offerMarketingConsent: true,
      requireTermsAcceptance: true,
    });
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error).toMatch(/Terms & Conditions acceptance/);
  });

  it('saves marketing happily when the box is optional', async () => {
    const slug = `mk-ok-${suffix}`;
    const result = await saveForm(null, {
      ...base(slug),
      lawfulBasis: 'LEGITIMATE_INTEREST',
      offerMarketingConsent: true,
      requireTermsAcceptance: false,
      consentCombinedLabel: 'Yes, keep me posted.',
    });
    expect(result.ok, result.ok === false ? result.error : '').toBe(true);

    const stored = await prisma.form.findFirstOrThrow({ where: { slug } });
    expect(stored.offerMarketingConsent).toBe(true);
    expect(stored.consentCombinedLabel).toBe('Yes, keep me posted.');
  });

  it('saves a required box with marketing switched off', async () => {
    const slug = `mk-req-${suffix}`;
    const result = await saveForm(null, {
      ...base(slug),
      lawfulBasis: 'CONSENT',
      offerMarketingConsent: false,
      requireTermsAcceptance: true,
    });
    expect(result.ok, result.ok === false ? result.error : '').toBe(true);

    const stored = await prisma.form.findFirstOrThrow({ where: { slug } });
    // An empty label means "compose it", which is what every form that has
    // never been given one does.
    expect(stored.consentCombinedLabel).toBeNull();
  });
});
