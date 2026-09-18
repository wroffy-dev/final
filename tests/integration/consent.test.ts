import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mockAuth, uniqueSuffix } from '../helpers';

mockAuth();

const { prisma } = await import('@/lib/db/prisma');
const { submitForm } = await import('@/lib/actions/submit-form');
const { publishNotice } = await import('@/lib/services/consent');

const suffix = uniqueSuffix();
const slug = `consent-form-${suffix}`;
let formId = '';
let countryId = '';

beforeAll(async () => {
  const country = await prisma.country.findFirstOrThrow({ where: { isDefault: true } });
  countryId = country.id;

  await publishNotice({
    key: 'default',
    countryId: null,
    actorId: null,
    content: {
      purposeText: 'To answer your enquiry.',
      enquiryLabel: 'I agree you may use my details to answer this enquiry.',
      marketingLabel: 'Optional: send me product news.',
      termsLabel: 'I accept the Terms & Conditions.',
      withdrawalText: 'Withdraw any time by emailing privacy@example.com.',
      privacyUrl: '/privacy',
      privacyVersion: '2026-01',
      termsUrl: '/terms',
      termsVersion: '2026-01',
    },
  });

  const form = await prisma.form.create({
    data: {
      name: `Consent form ${suffix}`,
      slug,
      isActive: true,
      lawfulBasis: 'CONSENT',
      offerMarketingConsent: true,
      requireTermsAcceptance: true,
      collectsPersonalData: true,
      fields: {
        create: [
          { type: 'TEXT', label: 'Full name', name: 'name', sortOrder: 0, isRequired: true },
          { type: 'EMAIL', label: 'Work email', name: 'email', sortOrder: 1, isRequired: true },
        ],
      },
    },
    select: { id: true },
  });
  formId = form.id;
});

afterAll(async () => {
  await prisma.consentRecord.deleteMany({ where: { lead: { form: { id: formId } } } });
  await prisma.formSubmission.deleteMany({ where: { formId } });
  await prisma.lead.deleteMany({ where: { formId } });
  await prisma.form.delete({ where: { id: formId } }).catch(() => {});
  await prisma.consentNotice.deleteMany({ where: { key: 'default' } });
});

const envelope = (over: Record<string, unknown> = {}) => ({
  formSlug: slug,
  elapsedMs: 5000,
  values: { name: 'Asha Rao', email: `asha.${suffix}@example.com` },
  ...over,
});

describe('consent enforcement', () => {
  it('rejects a direct submission that omits the consent object entirely', async () => {
    // This is the bypass attempt: call the action without the field the page
    // would have sent. It must fail the requirement, not skip it.
    const result = await submitForm(envelope());
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.fieldErrors?._consent?.[0]).toMatch(/tick the box/i);
    expect(await prisma.lead.count({ where: { formId } })).toBe(0);
  });

  it('rejects a submission that sends the box unticked', async () => {
    const result = await submitForm(envelope({ consent: { accepted: false } }));
    expect(result.ok).toBe(false);
    expect(await prisma.lead.count({ where: { formId } })).toBe(0);
  });

  it('rejects a crafted payload that claims marketing without ticking the box', async () => {
    // The old three-box shape, with only the optional one ticked. The box that
    // authorises the enquiry is what decides, and it was not ticked.
    const result = await submitForm(
      envelope({ consent: { enquiry: false, marketing: true, terms: true } }),
    );
    expect(result.ok).toBe(false);
    expect(await prisma.lead.count({ where: { formId } })).toBe(0);
  });

  it('accepts a ticked box, and records marketing as not offered', async () => {
    const result = await submitForm(envelope({ consent: { accepted: true } }));
    expect(result.ok, result.ok === false ? result.error : '').toBe(true);

    const lead = await prisma.lead.findFirstOrThrow({
      where: { formId },
      include: { consents: { include: { events: true } } },
    });
    expect(lead.consents).toHaveLength(1);
    const consent = lead.consents[0];
    expect(consent.enquiryConsent).toBe(true);
    /*
     * This form's box is required (lawful basis Consent, and Terms acceptance
     * on), so marketing cannot ride on it — it is not displayed, and one tick
     * therefore cannot subscribe anybody. Recorded as not presented, which is
     * a different fact from "declined".
     */
    expect(consent.marketingConsent).toBe(false);
    expect(consent.marketingPresented).toBe(false);
    expect(consent.termsAccepted).toBe(true);
    expect(consent.displayedLabel).toMatch(/Terms & Conditions/);
    expect(consent.lawfulBasis).toBe('CONSENT');
    expect(consent.privacyVersion).toBe('2026-01');
    expect(consent.noticeVersion).toBeGreaterThan(0);
    // The exact wording is kept, not just a pointer to a row that may change.
    expect((consent.noticeSnapshot as { enquiryLabel: string }).enquiryLabel).toMatch(
      /answer this enquiry/i,
    );
    expect(consent.events.map((e) => e.scope).sort()).toEqual(['ENQUIRY', 'MARKETING', 'TERMS']);
  });

  it('stores the submitted fields with the labels they had at the time', async () => {
    const submission = await prisma.formSubmission.findFirstOrThrow({
      where: { formId },
      orderBy: { createdAt: 'desc' },
    });
    expect(submission.data).toMatchObject({ name: 'Asha Rao' });
    expect(submission.fieldLabels).toMatchObject({ name: 'Full name', email: 'Work email' });
    expect(submission.formName).toContain('Consent form');
    expect(submission.countryId).toBe(countryId);
  });

  it('leaves a failed submission with no lead and no consent record', async () => {
    const before = await prisma.consentRecord.count();
    const result = await submitForm(envelope({ values: { name: '', email: 'not-an-email' } }));
    expect(result.ok).toBe(false);
    expect(await prisma.consentRecord.count()).toBe(before);
  });
});

describe('consent in the CRM', () => {
  it('shows an existing lead with no evidence as Not recorded, and never backfills it', async () => {
    const { consentDisplayState } = await import('@/lib/privacy/consent');
    const country = await prisma.country.findFirstOrThrow({ where: { isDefault: true } });

    // A lead of the kind that existed before consent evidence did.
    const legacy = await prisma.lead.create({
      data: {
        countryId: country.id,
        name: 'Legacy Lead',
        email: `legacy.${suffix}@example.com`,
      },
      select: { id: true },
    });

    const withConsents = await prisma.lead.findUniqueOrThrow({
      where: { id: legacy.id },
      include: { consents: true },
    });
    expect(withConsents.consents).toHaveLength(0);
    expect(consentDisplayState(withConsents.consents[0])).toBe('NOT_RECORDED');

    await prisma.lead.delete({ where: { id: legacy.id } });
  });

  it('records a withdrawal without editing what was agreed', async () => {
    const { withdrawConsent } = await import('@/lib/services/consent');

    const record = await prisma.consentRecord.findFirstOrThrow({
      where: { lead: { formId } },
      orderBy: { consentedAt: 'desc' },
    });
    expect(record.enquiryConsent).toBe(true);

    const result = await withdrawConsent({
      recordId: record.id,
      scope: 'ALL',
      actorId: null,
      note: 'Asked by email',
      ipAddress: '203.0.113.7',
    });
    expect(result.ok).toBe(true);

    const after = await prisma.consentRecord.findUniqueOrThrow({
      where: { id: record.id },
      include: { events: { orderBy: { createdAt: 'asc' } } },
    });
    // The original agreement is untouched — the withdrawal sits beside it.
    expect(after.enquiryConsent).toBe(true);
    expect(after.termsAccepted).toBe(true);
    expect(after.withdrawnAt).not.toBeNull();
    expect(after.withdrawnScope).toBe('ALL');
    expect(after.events.at(-1)?.type).toBe('WITHDRAWN');
    expect(after.events.at(-1)?.note).toBe('Asked by email');

    const { consentDisplayState } = await import('@/lib/privacy/consent');
    expect(consentDisplayState(after)).toBe('WITHDRAWN');

    // Marketing is suppressed on the lead, which is what sending reads.
    const lead = await prisma.lead.findUniqueOrThrow({ where: { id: after.leadId! } });
    expect(lead.marketingSuppressedAt).not.toBeNull();
  });

  it('reads Not applicable when processing does not rest on consent', async () => {
    const { consentDisplayState } = await import('@/lib/privacy/consent');
    expect(
      consentDisplayState({
        lawfulBasis: 'CONTRACT',
        enquiryConsent: false,
        withdrawnAt: null,
      }),
    ).toBe('NOT_APPLICABLE');
  });
});
