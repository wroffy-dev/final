import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mockAuth, uniqueSuffix } from '../helpers';

mockAuth();

const { prisma } = await import('@/lib/db/prisma');
const { submitForm } = await import('@/lib/actions/submit-form');
const { publishNotice, getCurrentNotice, resolveConsentRequirement } = await import(
  '@/lib/services/consent'
);
const { BUILT_IN_NOTICE_VERSION } = await import('@/lib/privacy/consent');

/**
 * The combined tick box, end to end, against the database.
 *
 * Two things here that unit tests cannot reach: a submission with **no notice
 * published at all** — the state of every fresh deployment, and the one that
 * made every public form unsubmittable — and publishing a notice for one market
 * without knocking out the others.
 */

const suffix = uniqueSuffix();
const slug = `combined-${suffix}`;
let formId = '';
let countryId = '';
let otherCountryId = '';

const envelope = (over: Record<string, unknown> = {}) => ({
  formSlug: slug,
  elapsedMs: 5000,
  values: { name: 'Asha Rao', email: `asha.${suffix}@example.com` },
  ...over,
});

const content = (over: Record<string, unknown> = {}) => ({
  purposeText: 'To answer your enquiry.',
  enquiryLabel: 'I agree you may use my details to answer this enquiry.',
  marketingLabel: 'Optional: send me product news.',
  termsLabel: 'I accept the Terms & Conditions.',
  withdrawalText: 'Withdraw any time by emailing privacy@example.com.',
  privacyUrl: '/privacy',
  privacyVersion: '2026-01',
  termsUrl: '/terms',
  termsVersion: '2026-01',
  ...over,
});

beforeAll(async () => {
  // Nothing published: the state every deployment starts in.
  await prisma.consentNotice.deleteMany({ where: { key: `nk-${suffix}` } });

  const country = await prisma.country.findFirstOrThrow({ where: { isDefault: true } });
  countryId = country.id;
  const other = await prisma.country.findFirst({ where: { isDefault: false } });
  otherCountryId = other?.id ?? '';

  const form = await prisma.form.create({
    data: {
      name: `Combined form ${suffix}`,
      slug,
      isActive: true,
      lawfulBasis: 'CONSENT',
      offerMarketingConsent: false,
      requireTermsAcceptance: false,
      collectsPersonalData: true,
      consentNoticeKey: `nk-${suffix}`,
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
  await prisma.consentNotice.deleteMany({ where: { key: `nk-${suffix}` } });
});

describe('no notice published', () => {
  it('serves the built-in wording as version 0', async () => {
    const notice = await getCurrentNotice(`nk-${suffix}`, countryId);
    expect(notice.version).toBe(BUILT_IN_NOTICE_VERSION);
    expect(notice.source).toBe('BUILT_IN');
    expect(notice.id).toBeNull();
  });

  it('submits successfully against it — the bug that broke every form', async () => {
    // Exactly what the rendered page sends back: the key and version the
    // server resolved for it, which for an unpublished key is the shared
    // default's key at version 0.
    const shown = await getCurrentNotice(`nk-${suffix}`, countryId);
    const result = await submitForm(
      envelope({
        consent: { noticeKey: shown.key, noticeVersion: shown.version, accepted: true },
      }),
    );
    expect(result.ok, result.ok === false ? result.error : '').toBe(true);

    const record = await prisma.consentRecord.findFirstOrThrow({
      where: { lead: { formId } },
      orderBy: { consentedAt: 'desc' },
    });
    expect(record.noticeVersion).toBe(BUILT_IN_NOTICE_VERSION);
    expect(record.enquiryConsent).toBe(true);
    expect(record.noticeId).toBeNull();
    expect(record.noticeScope).toBeNull();
  });

  it('refuses the same submission with the box unticked, and creates nothing', async () => {
    const before = await prisma.lead.count({ where: { formId } });
    const result = await submitForm(
      envelope({
        values: { name: 'Ravi', email: `ravi.${suffix}@example.com` },
        consent: { noticeVersion: BUILT_IN_NOTICE_VERSION, accepted: false },
      }),
    );
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.fieldErrors?._consent?.[0]).toMatch(/tick the box/i);
    expect(await prisma.lead.count({ where: { formId } })).toBe(before);
  });
});

describe('a published notice', () => {
  it('starts at version 1 and is used from then on', async () => {
    const published = await publishNotice({
      key: `nk-${suffix}`,
      countryId: null,
      actorId: null,
      content: content(),
    });
    expect(published.version).toBeGreaterThanOrEqual(1);

    const notice = await getCurrentNotice(`nk-${suffix}`, countryId);
    expect(notice.source).toBe('PUBLISHED');
    expect(notice.version).toBe(published.version);
  });

  it('accepts a submission citing it, and records that version', async () => {
    const notice = await getCurrentNotice(`nk-${suffix}`, countryId);
    const result = await submitForm(
      envelope({
        values: { name: 'Meera', email: `meera.${suffix}@example.com` },
        consent: { noticeKey: notice.key, noticeVersion: notice.version, accepted: true },
      }),
    );
    expect(result.ok, result.ok === false ? result.error : '').toBe(true);

    const record = await prisma.consentRecord.findFirstOrThrow({
      where: { lead: { formId } },
      orderBy: { consentedAt: 'desc' },
    });
    expect(record.noticeVersion).toBe(notice.version);
    expect(record.noticeId).not.toBeNull();
  });

  it('refuses a page that was open since before the wording changed', async () => {
    const before = await prisma.lead.count({ where: { formId } });
    const result = await submitForm(
      envelope({
        values: { name: 'Stale', email: `stale.${suffix}@example.com` },
        // A version that is no longer the live one.
        consent: { noticeKey: `nk-${suffix}`, noticeVersion: BUILT_IN_NOTICE_VERSION, accepted: true },
      }),
    );
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error).toMatch(/privacy notice changed/i);
    // Nothing is written from a submission the visitor has to redo.
    expect(await prisma.lead.count({ where: { formId } })).toBe(before);
  });
});

describe('marketing wording may be cleared', () => {
  it('publishes an empty marketing label, and keeps it empty', async () => {
    const published = await publishNotice({
      key: `nk-${suffix}`,
      countryId: null,
      actorId: null,
      content: content({ marketingLabel: '   ' }),
    });

    const stored = await prisma.consentNotice.findFirstOrThrow({
      where: { key: `nk-${suffix}`, version: published.version },
    });
    // Whitespace-only collapses to empty rather than rendering a blank line.
    expect(stored.marketingLabel).toBe('');
  });

  it('stops offering marketing on a form that asks for it', async () => {
    const optional = {
      consentNoticeKey: `nk-${suffix}`,
      lawfulBasis: 'LEGITIMATE_INTEREST' as const,
      offerMarketingConsent: true,
      requireTermsAcceptance: false,
      collectsPersonalData: true,
      consentCombinedLabel: null,
    };
    const requirement = await resolveConsentRequirement(optional, countryId);
    // The form still offers it; there is simply nothing to show, so nothing is.
    expect(requirement.presentsMarketing).toBe(false);
    expect(requirement.requireCheckbox).toBe(false);
  });

  it('offers it again once wording is restored', async () => {
    await publishNotice({
      key: `nk-${suffix}`,
      countryId: null,
      actorId: null,
      content: content({ marketingLabel: 'Send me product news.' }),
    });
    const requirement = await resolveConsentRequirement(
      {
        consentNoticeKey: `nk-${suffix}`,
        lawfulBasis: 'LEGITIMATE_INTEREST',
        offerMarketingConsent: true,
        requireTermsAcceptance: false,
        collectsPersonalData: true,
        consentCombinedLabel: null,
      },
      countryId,
    );
    expect(requirement.presentsMarketing).toBe(true);
    expect(requirement.combinedLabel).toMatch(/marketing/i);
  });

  it('never puts marketing behind a tick box the visitor must tick', async () => {
    // The combination the admin screen refuses. A row that already holds it —
    // copied between markets, or saved before the rule — must still be safe.
    const requirement = await resolveConsentRequirement(
      {
        consentNoticeKey: `nk-${suffix}`,
        lawfulBasis: 'CONSENT',
        offerMarketingConsent: true,
        requireTermsAcceptance: false,
        collectsPersonalData: true,
        consentCombinedLabel: null,
      },
      countryId,
    );
    expect(requirement.requireCheckbox).toBe(true);
    expect(requirement.presentsMarketing).toBe(false);
  });
});

describe('publishing for one market', () => {
  it('leaves the shared notice and other markets live', async () => {
    if (!otherCountryId) return; // single-market install: nothing to protect

    const shared = await prisma.consentNotice.findFirstOrThrow({
      where: { key: `nk-${suffix}`, countryId: null, isCurrent: true },
      select: { id: true, version: true },
    });

    const local = await publishNotice({
      key: `nk-${suffix}`,
      countryId: otherCountryId,
      actorId: null,
      content: content({ purposeText: 'To answer your enquiry in this market.' }),
    });

    // The market-specific one is live where it applies…
    const forOther = await getCurrentNotice(`nk-${suffix}`, otherCountryId);
    expect(forOther.version).toBe(local.version);
    expect(forOther.scope).not.toBeNull();

    // …and the shared one is untouched, still live everywhere else.
    const stillShared = await prisma.consentNotice.findUniqueOrThrow({
      where: { id: shared.id },
      select: { isCurrent: true },
    });
    expect(stillShared.isCurrent).toBe(true);

    const forDefault = await getCurrentNotice(`nk-${suffix}`, countryId);
    expect(forDefault.version).toBe(shared.version);
    expect(forDefault.scope).toBeNull();
  });

  it('allocates increasing versions when publishes race each other', async () => {
    const before = await prisma.consentNotice.findFirstOrThrow({
      where: { key: `nk-${suffix}` },
      orderBy: { version: 'desc' },
      select: { version: true },
    });

    const results = await Promise.all(
      [1, 2, 3].map((n) =>
        publishNotice({
          key: `nk-${suffix}`,
          countryId: null,
          actorId: null,
          content: content({ purposeText: `Concurrent publish ${n}.` }),
        }),
      ),
    );

    const versions = results.map((r) => r.version).sort((a, b) => a - b);
    // Three distinct, positive, increasing versions — none lost to the race.
    expect(new Set(versions).size).toBe(3);
    expect(versions[0]).toBeGreaterThan(before.version);

    // And exactly one of them is live for the shared scope.
    const live = await prisma.consentNotice.count({
      where: { key: `nk-${suffix}`, countryId: null, isCurrent: true },
    });
    expect(live).toBe(1);
  });
});

describe('historical evidence', () => {
  it('leaves records written before the combined box alone', async () => {
    const country = await prisma.country.findFirstOrThrow({ where: { isDefault: true } });
    const lead = await prisma.lead.create({
      data: { countryId: country.id, name: 'Old Lead', email: `old.${suffix}@example.com` },
      select: { id: true },
    });

    // An evidence row of the shape this release inherited: the new columns
    // simply absent.
    const record = await prisma.consentRecord.create({
      data: {
        leadId: lead.id,
        noticeKey: 'default',
        noticeVersion: 1,
        noticeSnapshot: { enquiryLabel: 'Old wording' },
        purposeText: 'Old purpose',
        lawfulBasis: 'CONSENT',
        enquiryConsent: true,
        marketingConsent: true,
        privacyUrl: '/privacy',
        termsUrl: '/terms',
      },
      select: { id: true },
    });

    const stored = await prisma.consentRecord.findUniqueOrThrow({ where: { id: record.id } });
    expect(stored.marketingPresented).toBeNull();
    expect(stored.displayedLabel).toBeNull();
    expect(stored.noticeScope).toBeNull();
    // What it always said, unchanged.
    expect(stored.enquiryConsent).toBe(true);
    expect(stored.marketingConsent).toBe(true);

    await prisma.lead.delete({ where: { id: lead.id } });
  });
});
