import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { mockAuth, formData, uniqueSuffix, TEST_ACTOR } from '../helpers';

mockAuth();

const { prisma } = await import('@/lib/db/prisma');
const { submitForm } = await import('@/lib/actions/submit-form');
const {
  createLead,
  changeLeadStatus,
  assignLead,
  addLeadNote,
  moveLeadInPipeline,
  bulkLeadAction,
  exportLeads,
  convertLeadToCustomer,
  deleteLead,
} = await import('@/lib/actions/leads');
const { __resetRateLimits } = await import('@/lib/utils/rate-limit');

const suffix = uniqueSuffix();
const formSlug = `test-form-${suffix}`;
const createdLeadIds: string[] = [];
let formId = '';
let productId = '';
let staffId = '';

beforeAll(async () => {
  const role = await prisma.userRole.upsert({
    where: { slug: 'test-role-leads' },
    update: {},
    create: { slug: 'test-role-leads', name: 'Test Role Leads', rank: 5 },
  });
  await prisma.user.upsert({
    where: { id: TEST_ACTOR.id },
    update: {},
    create: { id: TEST_ACTOR.id, email: TEST_ACTOR.email, name: TEST_ACTOR.name, roleId: role.id },
  });
  staffId = TEST_ACTOR.id;

  const product = await prisma.product.create({
    data: {
      name: `Lead Test Plan ${suffix}`,
      slug: `lead-test-plan-${suffix}`,
      status: 'PUBLISHED',
      publishedAt: new Date(),
    },
  });
  productId = product.id;

  const form = await prisma.form.create({
    data: {
      name: `Test Form ${suffix}`,
      slug: formSlug,
      leadSource: 'Integration test',
      defaultProductId: product.id,
      fields: {
        create: [
          { type: 'NAME', label: 'Full name', name: 'name', isRequired: true, sortOrder: 10 },
          { type: 'EMAIL', label: 'Work email', name: 'email', isRequired: true, sortOrder: 20 },
          { type: 'PHONE', label: 'Phone', name: 'phone', sortOrder: 30 },
          { type: 'COMPANY', label: 'Company', name: 'company', sortOrder: 40 },
          {
            type: 'SELECT',
            label: 'Team size',
            name: 'team_size',
            sortOrder: 50,
            options: [
              { label: 'Small', value: 'small' },
              { label: 'Large', value: 'large' },
            ],
          },
          { type: 'TEXTAREA', label: 'Message', name: 'message', sortOrder: 60 },
        ],
      },
    },
  });
  formId = form.id;
  __resetRateLimits();
});

afterAll(async () => {
  await prisma.lead.deleteMany({ where: { formId } });
  await prisma.formSubmission.deleteMany({ where: { formId } });
  await prisma.lead.deleteMany({ where: { id: { in: createdLeadIds } } });
  await prisma.customer.deleteMany({ where: { email: { contains: suffix } } });
  await prisma.form.deleteMany({ where: { id: formId } });
  await prisma.product.deleteMany({ where: { id: productId } });
  await prisma.auditLog.deleteMany({ where: { actorId: TEST_ACTOR.id } });
  await prisma.user.deleteMany({ where: { id: TEST_ACTOR.id } });
  await prisma.userRole.deleteMany({ where: { slug: 'test-role-leads' } });
  await prisma.$disconnect();
});

describe('public form submission', () => {
  it('creates a lead with product, page and attribution', async () => {
    const result = await submitForm({
      consent: { enquiry: true, marketing: false, terms: false },
      formSlug,
      elapsedMs: 5000,
      values: {
        name: 'Ada Lovelace',
        email: `ada+${suffix}@example.test`,
        phone: '+91 98765 43210',
        company: 'Analytical Engines',
        team_size: 'large',
        message: 'We need 40 seats.',
      },
      attribution: {
        utmSource: 'google',
        utmMedium: 'cpc',
        utmCampaign: 'q1-dropbox',
        firstUtmSource: 'linkedin',
        firstUtmCampaign: 'awareness',
        firstLandingUrl: '/blog/migration',
        referrer: 'https://www.google.com/',
        landingUrl: '/pricing?utm_source=google',
        pagePath: '/pricing',
        ctaLabel: 'Get a quote',
        ctaLocation: 'product-table',
      },
    });

    expect(result.ok).toBe(true);

    const lead = await prisma.lead.findFirstOrThrow({
      where: { formId },
      orderBy: { createdAt: 'desc' },
    });
    createdLeadIds.push(lead.id);

    expect(lead.name).toBe('Ada Lovelace');
    expect(lead.company).toBe('Analytical Engines');
    expect(lead.message).toBe('We need 40 seats.');
    expect(lead.productId).toBe(productId);
    expect(lead.source).toBe('Integration test');
    expect(lead.ctaLabel).toBe('Get a quote');

    // Last touch and first touch are stored separately.
    expect(lead.utmSource).toBe('google');
    expect(lead.utmCampaign).toBe('q1-dropbox');
    expect(lead.firstUtmSource).toBe('linkedin');
    expect(lead.firstUtmCampaign).toBe('awareness');
    expect(lead.firstLandingUrl).toBe('/blog/migration');

    // The IP is only ever stored as a salted hash.
    expect(lead.ipHash).toBeTruthy();
    expect(lead.ipHash).not.toContain('203.0.113');
  });

  it('records the submission and links it to the lead', async () => {
    const submission = await prisma.formSubmission.findFirstOrThrow({
      where: { formId },
      orderBy: { createdAt: 'desc' },
    });
    expect(submission.leadId).toBeTruthy();
    expect((submission.data as Record<string, string>).team_size).toBe('large');
  });

  it('logs a creation activity', async () => {
    const lead = await prisma.lead.findFirstOrThrow({ where: { formId }, orderBy: { createdAt: 'desc' } });
    const activity = await prisma.leadActivity.findFirst({ where: { leadId: lead.id, type: 'CREATED' } });
    expect(activity).not.toBeNull();
  });

  it('rejects a submission missing a required field', async () => {
    __resetRateLimits();
    const result = await submitForm({
      consent: { enquiry: true, marketing: false, terms: false },
      formSlug,
      elapsedMs: 5000,
      values: { name: 'No Email', email: '', phone: '', company: '', message: '' },
    });
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.fieldErrors?.email).toBeTruthy();
  });

  it('rejects an invalid email address', async () => {
    __resetRateLimits();
    const result = await submitForm({
      consent: { enquiry: true, marketing: false, terms: false },
      formSlug,
      elapsedMs: 5000,
      values: { name: 'Bad Email', email: 'not-an-email', phone: '', company: '', message: '' },
    });
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.fieldErrors?.email).toBeTruthy();
  });

  it('rejects a value outside the configured select options', async () => {
    __resetRateLimits();
    const result = await submitForm({
      consent: { enquiry: true, marketing: false, terms: false },
      formSlug,
      elapsedMs: 5000,
      values: {
        name: 'Tamperer',
        email: `tamper+${suffix}@example.test`,
        team_size: 'not-an-option',
      },
    });
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.fieldErrors?.team_size).toBeTruthy();
  });

  it('silently accepts but discards a honeypot submission', async () => {
    __resetRateLimits();
    const before = await prisma.lead.count({ where: { formId } });
    const result = await submitForm({
      consent: { enquiry: true, marketing: false, terms: false },
      formSlug,
      elapsedMs: 5000,
      website: 'http://spam.example',
      values: { name: 'Bot', email: `bot+${suffix}@example.test` },
    });
    expect(result.ok).toBe(true);
    expect(await prisma.lead.count({ where: { formId } })).toBe(before);
  });

  it('rejects a submission completed impossibly fast', async () => {
    __resetRateLimits();
    const result = await submitForm({
      consent: { enquiry: true, marketing: false, terms: false },
      formSlug,
      elapsedMs: 200,
      values: { name: 'Speedy', email: `speedy+${suffix}@example.test` },
    });
    expect(result.ok).toBe(false);
  });

  it('rate limits repeated submissions from one address', async () => {
    __resetRateLimits();
    const results = [];
    for (let i = 0; i < 7; i += 1) {
      results.push(
        await submitForm({
      consent: { enquiry: true, marketing: false, terms: false },
          formSlug,
          elapsedMs: 5000,
          values: { name: `Repeat ${i}`, email: `repeat${i}+${suffix}@example.test` },
        }),
      );
    }
    expect(results.filter((r) => r.ok).length).toBe(5);
    const blocked = results.find((r) => !r.ok);
    expect(blocked && !blocked.ok && blocked.error).toMatch(/too many/i);
  });

  it('refuses an unknown form', async () => {
    __resetRateLimits();
    const result = await submitForm({ formSlug: 'no-such-form', values: { email: 'a@b.com' } });
    expect(result.ok).toBe(false);
  });
});

describe('CRM operations', () => {
  let leadId = '';

  it('creates a lead manually', async () => {
    const result = await createLead(
      formData({
        name: `Manual Lead ${suffix}`,
        email: `manual+${suffix}@example.test`,
        phone: '+91 98765 00000',
        company: 'Manual Co',
        status: 'NEW',
        priority: 'HIGH',
        productId,
        value: '250000',
      }),
    );
    expect(result.ok).toBe(true);
    leadId = (result as { data: { id: string } }).data.id;
    createdLeadIds.push(leadId);

    const lead = await prisma.lead.findUniqueOrThrow({ where: { id: leadId } });
    expect(lead.value?.toString()).toBe('250000');
    expect(lead.priority).toBe('HIGH');
  });

  it('changes status and records the transition', async () => {
    expect((await changeLeadStatus({ leadId, status: 'QUALIFIED' })).ok).toBe(true);

    const lead = await prisma.lead.findUniqueOrThrow({ where: { id: leadId } });
    expect(lead.status).toBe('QUALIFIED');

    const activity = await prisma.leadActivity.findFirst({
      where: { leadId, type: 'STATUS_CHANGED' },
      orderBy: { createdAt: 'desc' },
    });
    expect(activity?.summary).toContain('Qualified');
  });

  it('assigns the lead to a staff member', async () => {
    expect((await assignLead({ leadId, assignedToId: staffId })).ok).toBe(true);
    const lead = await prisma.lead.findUniqueOrThrow({ where: { id: leadId } });
    expect(lead.assignedToId).toBe(staffId);
  });

  it('refuses to assign to an unknown staff member', async () => {
    const result = await assignLead({ leadId, assignedToId: 'not-a-real-user' });
    expect(result.ok).toBe(false);
  });

  it('adds a note', async () => {
    expect((await addLeadNote({ leadId, body: 'Called and left a voicemail.' })).ok).toBe(true);
    expect(await prisma.leadNote.count({ where: { leadId } })).toBe(1);
  });

  it('rejects an empty note', async () => {
    const result = await addLeadNote({ leadId, body: '   ' });
    expect(result.ok).toBe(false);
  });

  it('moves the lead through the pipeline and persists column order', async () => {
    const result = await moveLeadInPipeline({ leadId, status: 'PROPOSAL', order: [leadId] });
    expect(result.ok).toBe(true);

    const lead = await prisma.lead.findUniqueOrThrow({ where: { id: leadId } });
    expect(lead.status).toBe('PROPOSAL');
    expect(lead.pipelineOrder).toBe(10);
  });

  it('records a lost reason', async () => {
    const other = await createLead(
      formData({ name: `Lost Lead ${suffix}`, email: `lost+${suffix}@example.test` }),
    );
    const otherId = (other as { data: { id: string } }).data.id;
    createdLeadIds.push(otherId);

    await changeLeadStatus({ leadId: otherId, status: 'LOST', lostReason: 'Chose a competitor' });
    const lead = await prisma.lead.findUniqueOrThrow({ where: { id: otherId } });
    expect(lead.status).toBe('LOST');
    expect(lead.lostReason).toBe('Chose a competitor');
  });

  it('applies a bulk status change', async () => {
    const result = await bulkLeadAction({ ids: [leadId], action: 'status', status: 'NEGOTIATION' });
    expect(result.ok).toBe(true);
    expect((await prisma.lead.findUniqueOrThrow({ where: { id: leadId } })).status).toBe('NEGOTIATION');
  });

  it('exports leads as CSV with attribution columns', async () => {
    const result = await exportLeads({ q: suffix });
    expect(result.ok).toBe(true);

    const csv = (result as { data: { csv: string } }).data.csv;
    expect(csv).toContain('utm_source');
    expect(csv).toContain('first_utm_source');
    expect(csv.split('\r\n').length).toBeGreaterThan(1);
  });

  it('escapes formulas in exported CSV cells', async () => {
    const injected = await createLead(
      formData({ name: `=cmd|' /c calc'!A1 ${suffix}`, email: `inject+${suffix}@example.test` }),
    );
    createdLeadIds.push((injected as { data: { id: string } }).data.id);

    const result = await exportLeads({ q: suffix });
    const csv = (result as { data: { csv: string } }).data.csv;
    expect(csv).toContain("\"'=cmd");
  });

  it('converts a won lead into a customer', async () => {
    await changeLeadStatus({ leadId, status: 'WON' });
    const result = await convertLeadToCustomer(leadId);
    expect(result.ok).toBe(true);

    const customerId = (result as { data: { id: string } }).data.id;
    const customer = await prisma.customer.findUniqueOrThrow({
      where: { id: customerId },
      include: { products: true },
    });
    expect(customer.email).toBe(`manual+${suffix}@example.test`);
    expect(customer.products).toHaveLength(1);

    const lead = await prisma.lead.findUniqueOrThrow({ where: { id: leadId } });
    expect(lead.customerId).toBe(customerId);
  });

  it('refuses to convert the same lead twice', async () => {
    const result = await convertLeadToCustomer(leadId);
    expect(result.ok).toBe(false);
  });

  it('soft-deletes a lead', async () => {
    expect((await deleteLead(leadId)).ok).toBe(true);
    const lead = await prisma.lead.findUniqueOrThrow({ where: { id: leadId } });
    expect(lead.deletedAt).not.toBeNull();
  });
});

describe('CRM authorisation', () => {
  it('refuses to assign a lead without leads.assign', async () => {
    vi.resetModules();
    const { mockAuth: restrictedAuth } = await import('../helpers');
    restrictedAuth(['leads.view', 'leads.edit'], 'sales');

    const restricted = await import('@/lib/actions/leads');
    const lead = await prisma.lead.findFirstOrThrow({ where: { id: { in: createdLeadIds } } });
    const result = await restricted.assignLead({ leadId: lead.id, assignedToId: staffId });

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error).toMatch(/permission/i);
  });

  it('refuses to export leads without leads.export', async () => {
    vi.resetModules();
    const { mockAuth: restrictedAuth } = await import('../helpers');
    restrictedAuth(['leads.view'], 'sales');

    const restricted = await import('@/lib/actions/leads');
    const result = await restricted.exportLeads({});
    expect(result.ok).toBe(false);
  });
});
