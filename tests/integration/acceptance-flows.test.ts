/**
 * The four business flows from the acceptance criteria, exercised end to end
 * through the same Server Actions the admin panel calls.
 *
 * These deliberately overlap the per-area suites: the point is to prove the
 * flows compose, not to re-test each action in isolation.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  mockAuth,
  formData,
  uniqueSuffix,
  TEST_ACTOR,
  ensureTestCountry,
  testCountryContext,
  ensureSystemRoles,
} from '../helpers';

mockAuth();

const { prisma } = await import('@/lib/db/prisma');
const { createPage, addSection, updateSection, reorderSections, setPageStatus } = await import(
  '@/lib/actions/pages'
);
const { createProduct, setProductStatus, toggleProductFeatured } = await import(
  '@/lib/actions/products'
);
const { saveForm } = await import('@/lib/actions/forms');
const { createBlogPost, setBlogPostStatus, saveBlogCategory } = await import('@/lib/actions/blog');
const { submitForm } = await import('@/lib/actions/submit-form');
const { assignLead, changeLeadStatus, addLeadNote, convertLeadToCustomer } = await import(
  '@/lib/actions/leads'
);
const { getPublishedPage } = await import('@/lib/services/pages');
const { getPublicProduct, selectProducts } = await import('@/lib/services/products');
const { getPublishedPost } = await import('@/lib/services/blog');
const { getPublicForm } = await import('@/lib/services/forms');
const { __resetRateLimits } = await import('@/lib/utils/rate-limit');

const suffix = uniqueSuffix();
const cleanup = {
  pages: [] as string[],
  products: [] as string[],
  forms: [] as string[],
  posts: [] as string[],
  categories: [] as string[],
  leads: [] as string[],
  customers: [] as string[],
};

beforeAll(async () => {
  await ensureSystemRoles();
  const role = await prisma.userRole.findUniqueOrThrow({ where: { slug: 'super-admin' } });
  await prisma.user.upsert({
    where: { id: TEST_ACTOR.id },
    update: {},
    create: { id: TEST_ACTOR.id, email: TEST_ACTOR.email, name: TEST_ACTOR.name, roleId: role.id },
  });
  __resetRateLimits();
});

afterAll(async () => {
  await prisma.formSubmission.deleteMany({ where: { formId: { in: cleanup.forms } } });
  await prisma.lead.deleteMany({ where: { id: { in: cleanup.leads } } });
  await prisma.customer.deleteMany({ where: { id: { in: cleanup.customers } } });
  await prisma.page.deleteMany({ where: { id: { in: cleanup.pages } } });
  await prisma.form.deleteMany({ where: { id: { in: cleanup.forms } } });
  await prisma.product.deleteMany({ where: { id: { in: cleanup.products } } });
  await prisma.blogPost.deleteMany({ where: { id: { in: cleanup.posts } } });
  await prisma.blogCategory.deleteMany({ where: { id: { in: cleanup.categories } } });
  await prisma.auditLog.deleteMany({ where: { actorId: TEST_ACTOR.id } });
  await prisma.user.deleteMany({ where: { id: TEST_ACTOR.id } });
  await prisma.$disconnect();
});

describe('Flow B — create a product', () => {
  it('creates, prices, publishes and exposes a product', async () => {
    const created = await createProduct(
      formData({
        name: `Acceptance Plan ${suffix}`,
        slug: '',
        status: 'DRAFT',
        currency: 'INR',
        monthlyPrice: '1999.00',
        annualPrice: '19990.00',
        storage: '5 TB',
        minUsers: '3',
        shortDescription: 'Five terabytes for growing teams.',
        features: ['5 TB shared storage', '180-day recovery'],
        seoTitle: `Acceptance Plan ${suffix} — pricing`,
        ctaLabel: 'Get a quote',
      }),
    );
    expect(created.ok).toBe(true);
    const productId = (created as { data: { id: string } }).data.id;
    cleanup.products.push(productId);

    // A draft is invisible publicly…
    expect(await getPublicProduct(testCountryContext(), `acceptance-plan-${suffix}`)).toBeNull();

    // …until it is published.
    expect((await setProductStatus(productId, 'PUBLISHED')).ok).toBe(true);
    await toggleProductFeatured(productId);

    const product = await getPublicProduct(testCountryContext(), `acceptance-plan-${suffix}`);
    expect(product?.monthlyPrice).toBe('1999');
    expect(product?.isFeatured).toBe(true);
    expect(product?.features).toContain('5 TB shared storage');
  });
});

describe('Flow A — build and publish a page', () => {
  it('creates a page, adds and reorders sections, then publishes it', async () => {
    // A form for the page's CTA, so the flow ends at a real conversion point.
    const formResult = await saveForm(null, {
      name: `Acceptance Form ${suffix}`,
      slug: `acceptance-form-${suffix}`,
      isActive: true,
      submitLabel: 'Request a quote',
      successMessage: 'Thanks — we will be in touch.',
      createsLead: true,
      leadSource: 'Acceptance page',
      fields: [
        { type: 'NAME', label: 'Full name', name: 'name', isRequired: true, width: 'half', options: [] },
        { type: 'EMAIL', label: 'Work email', name: 'email', isRequired: true, width: 'half', options: [] },
        { type: 'COMPANY', label: 'Company', name: 'company', isRequired: false, width: 'half', options: [] },
      ],
    });
    expect(formResult.ok).toBe(true);
    const formId = (formResult as { data: { id: string } }).data.id;
    cleanup.forms.push(formId);

    const pageResult = await createPage(
      formData({
        title: `Acceptance Page ${suffix}`,
        slug: '',
        status: 'DRAFT',
        seoTitle: `Acceptance Page ${suffix}`,
        seoDescription: 'A page assembled entirely from CMS sections.',
      }),
    );
    expect(pageResult.ok).toBe(true);
    const pageId = (pageResult as { data: { id: string } }).data.id;
    cleanup.pages.push(pageId);

    // Add a hero, features, a product table, an FAQ and a CTA.
    const blocks = ['hero', 'featureGrid', 'productTable', 'faq', 'cta'] as const;
    for (const block of blocks) {
      const added = await addSection(pageId, block);
      expect(added.ok).toBe(true);
    }

    const sections = await prisma.pageSection.findMany({
      where: { pageId },
      orderBy: { sortOrder: 'asc' },
    });
    expect(sections.map((s) => s.blockType)).toEqual([...blocks]);

    // Configure the hero and the FAQ.
    const hero = sections[0]!;
    expect(
      (
        await updateSection(hero.id, {
          content: {
            eyebrow: 'Acceptance',
            heading: `Welcome to ${suffix}`,
            description: 'Assembled from CMS sections with no code change.',
            primaryCtaLabel: 'Get a quote',
            primaryCtaUrl: '/contact',
            alignment: 'center',
          },
          settings: { background: 'gradient', paddingTop: 'xl', paddingBottom: 'lg' },
        })
      ).ok,
    ).toBe(true);

    const faq = sections[3]!;
    expect(
      (
        await updateSection(faq.id, {
          content: {
            heading: 'Questions',
            items: [{ question: 'Is this real?', answer: '<p>Yes — it renders from the database.</p>' }],
          },
        })
      ).ok,
    ).toBe(true);

    // Reorder: move the CTA above the FAQ.
    const reordered = [
      sections[0]!.id,
      sections[1]!.id,
      sections[2]!.id,
      sections[4]!.id,
      sections[3]!.id,
    ];
    expect((await reorderSections({ pageId, order: reordered })).ok).toBe(true);

    // A draft page stays off the public site.
    expect(await getPublishedPage(await ensureTestCountry(), `acceptance-page-${suffix}`)).toBeNull();

    expect((await setPageStatus(pageId, 'PUBLISHED')).ok).toBe(true);

    const page = await getPublishedPage(await ensureTestCountry(), `acceptance-page-${suffix}`);
    expect(page).not.toBeNull();
    expect(page!.sections.map((s) => s.blockType)).toEqual([
      'hero',
      'featureGrid',
      'productTable',
      'cta',
      'faq',
    ]);

    const heroContent = page!.sections[0]!.content as Record<string, unknown>;
    expect(heroContent.heading).toBe(`Welcome to ${suffix}`);

    // The product table block resolves real published products.
    const tableProducts = await selectProducts(testCountryContext(), { source: 'featured', limit: 6 });
    expect(tableProducts.some((p) => p.slug === `acceptance-plan-${suffix}`)).toBe(true);
  });
});

describe('Flow C — visitor becomes a lead, then a customer', () => {
  it('captures the lead with full context and works it through the pipeline', async () => {
    __resetRateLimits();

    const product = await prisma.product.findFirstOrThrow({
      where: { slug: `acceptance-plan-${suffix}` },
    });
    const form = await getPublicForm(`acceptance-form-${suffix}`);
    expect(form).not.toBeNull();

    // The visitor arrives from a campaign, browses, then converts on the page.
    const submitted = await submitForm({
      consent: { enquiry: true, marketing: false, terms: false },
      formSlug: form!.slug,
      productId: product.id,
      elapsedMs: 9000,
      values: {
        name: 'Grace Hopper',
        email: `grace+${suffix}@example.test`,
        company: 'Navy Yard',
      },
      attribution: {
        utmSource: 'google',
        utmMedium: 'cpc',
        utmCampaign: `acceptance-${suffix}`,
        firstUtmSource: 'linkedin',
        firstUtmCampaign: 'awareness',
        firstLandingUrl: '/blog/migration',
        landingUrl: `/acceptance-page-${suffix}`,
        pagePath: `/acceptance-page-${suffix}`,
        ctaLabel: 'Get a quote',
        ctaLocation: 'product-table',
      },
    });
    expect(submitted.ok).toBe(true);

    const lead = await prisma.lead.findFirstOrThrow({
      where: { email: `grace+${suffix}@example.test` },
      include: { landingPage: true },
    });
    cleanup.leads.push(lead.id);

    // Everything the sales team needs to have the conversation.
    expect(lead.productId).toBe(product.id);
    expect(lead.landingPage?.slug).toBe(`acceptance-page-${suffix}`);
    expect(lead.ctaLabel).toBe('Get a quote');
    expect(lead.utmCampaign).toBe(`acceptance-${suffix}`);
    expect(lead.firstUtmSource).toBe('linkedin');
    expect(lead.source).toBe('Acceptance page');
    expect(lead.status).toBe('NEW');

    // Sales works it.
    expect((await assignLead({ leadId: lead.id, assignedToId: TEST_ACTOR.id })).ok).toBe(true);
    expect((await addLeadNote({ leadId: lead.id, body: 'Discovery call booked.' })).ok).toBe(true);

    for (const status of ['CONTACTED', 'QUALIFIED', 'PROPOSAL', 'NEGOTIATION', 'WON'] as const) {
      expect((await changeLeadStatus({ leadId: lead.id, status })).ok).toBe(true);
    }

    const converted = await convertLeadToCustomer(lead.id);
    expect(converted.ok).toBe(true);
    const customerId = (converted as { data: { id: string } }).data.id;
    cleanup.customers.push(customerId);

    const customer = await prisma.customer.findUniqueOrThrow({
      where: { id: customerId },
      include: { products: true, leads: true },
    });
    expect(customer.email).toBe(`grace+${suffix}@example.test`);
    expect(customer.products).toHaveLength(1);
    expect(customer.leads).toHaveLength(1);

    // The whole journey is on the timeline.
    const activities = await prisma.leadActivity.findMany({ where: { leadId: lead.id } });
    const types = activities.map((a) => a.type);
    expect(types).toContain('CREATED');
    expect(types).toContain('ASSIGNED');
    expect(types).toContain('NOTE_ADDED');
    expect(types).toContain('CONVERTED');
    expect(types.filter((t) => t === 'STATUS_CHANGED')).toHaveLength(5);
  });
});

describe('Flow D — publish a blog post', () => {
  it('creates a categorised, tagged post and publishes it', async () => {
    const categoryResult = await saveBlogCategory(
      null,
      formData({ name: `Acceptance ${suffix}`, slug: '', sortOrder: 0 }),
    );
    expect(categoryResult.ok).toBe(true);
    const categoryId = (categoryResult as { data: { id: string } }).data.id;
    cleanup.categories.push(categoryId);

    const postResult = await createBlogPost(
      formData({
        title: `Acceptance Article ${suffix}`,
        slug: '',
        status: 'DRAFT',
        content: `<h2>Heading</h2><p>${'word '.repeat(300)}</p>`,
        categoryId,
        authorId: TEST_ACTOR.id,
        tags: [`Acceptance ${suffix}`, 'Migration'],
        seoTitle: `Acceptance Article ${suffix}`,
      }),
    );
    expect(postResult.ok).toBe(true);
    const postId = (postResult as { data: { id: string } }).data.id;
    cleanup.posts.push(postId);

    expect(await getPublishedPost(await ensureTestCountry(), `acceptance-article-${suffix}`)).toBeNull();

    expect((await setBlogPostStatus(postId, 'PUBLISHED')).ok).toBe(true);

    const post = await getPublishedPost(await ensureTestCountry(), `acceptance-article-${suffix}`);
    expect(post).not.toBeNull();
    expect(post!.category?.id).toBe(categoryId);
    expect(post!.author?.name).toBe(TEST_ACTOR.name);
    expect(post!.tags).toHaveLength(2);
    expect(post!.readingTime).toBeGreaterThan(0);
    expect(post!.excerpt).toBeTruthy();
  });
});
