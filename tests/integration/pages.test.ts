import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { mockAuth, formData, uniqueSuffix, TEST_ACTOR, ensureTestCountry, testCountryContext } from '../helpers';

mockAuth();

const { prisma } = await import('@/lib/db/prisma');
const {
  createPage,
  updatePage,
  addSection,
  updateSection,
  reorderSections,
  duplicateSection,
  toggleSectionVisibility,
  deleteSection,
  setPageStatus,
  duplicatePage,
  deletePage,
} = await import('@/lib/actions/pages');
const { getPublishedPage } = await import('@/lib/services/pages');
const { parseSectionDesign } = await import('@/lib/cms/design');

const created: string[] = [];
const suffix = uniqueSuffix();

beforeAll(async () => {
  await prisma.userRole.upsert({
    where: { slug: 'test-role' },
    update: {},
    create: { slug: 'test-role', name: 'Test Role', rank: 5 },
  });
  const role = await prisma.userRole.findUniqueOrThrow({ where: { slug: 'test-role' } });
  await prisma.user.upsert({
    where: { id: TEST_ACTOR.id },
    update: {},
    create: { id: TEST_ACTOR.id, email: TEST_ACTOR.email, name: TEST_ACTOR.name, roleId: role.id },
  });
});

afterAll(async () => {
  await prisma.page.deleteMany({ where: { id: { in: created } } });
  await prisma.auditLog.deleteMany({ where: { actorId: TEST_ACTOR.id } });
  await prisma.user.deleteMany({ where: { id: TEST_ACTOR.id } });
  await prisma.userRole.deleteMany({ where: { slug: 'test-role' } });
  await prisma.$disconnect();
});

describe('page lifecycle', () => {
  let pageId = '';

  it('creates a draft page with a slugified URL', async () => {
    const result = await createPage(
      formData({ title: `Test Page ${suffix}`, slug: '', status: 'DRAFT' }),
    );
    expect(result.ok).toBe(true);
    pageId = (result as { data: { id: string } }).data.id;
    created.push(pageId);

    const page = await prisma.page.findUniqueOrThrow({ where: { id: pageId } });
    expect(page.status).toBe('DRAFT');
    expect(page.slug).toBe(`test-page-${suffix}`);
  });

  it('keeps a draft page off the public site', async () => {
    expect(await getPublishedPage(await ensureTestCountry(), `test-page-${suffix}`)).toBeNull();
  });

  it('records an audit entry for the creation', async () => {
    const entry = await prisma.auditLog.findFirst({
      where: { entity: 'Page', entityId: pageId, action: 'created' },
    });
    expect(entry).not.toBeNull();
    expect(entry?.actorEmail).toBe(TEST_ACTOR.email);
  });

  it('adds sections with schema defaults applied', async () => {
    const hero = await addSection(pageId, 'hero');
    const faq = await addSection(pageId, 'faq');
    expect(hero.ok && faq.ok).toBe(true);

    const sections = await prisma.pageSection.findMany({
      where: { pageId },
      orderBy: { sortOrder: 'asc' },
    });
    expect(sections.map((s) => s.blockType)).toEqual(['hero', 'faq']);
    expect((sections[0]!.content as Record<string, unknown>).alignment).toBe('left');
  });

  it('rejects an unknown block type', async () => {
    const result = await addSection(pageId, 'definitely-not-a-block');
    expect(result.ok).toBe(false);
  });

  it('validates section content against the block schema', async () => {
    const [hero] = await prisma.pageSection.findMany({ where: { pageId }, orderBy: { sortOrder: 'asc' } });

    // Settings written in the original v1 shape are accepted and upgraded, so a
    // page built before the design system still saves without losing its look.
    const good = await updateSection(hero!.id, {
      content: { heading: 'Real heading', description: 'Body copy', alignment: 'center' },
      settings: { background: 'brand', paddingTop: 'xl' },
    });
    expect(good.ok).toBe(true);

    const stored = await prisma.pageSection.findUniqueOrThrow({ where: { id: hero!.id } });
    expect((stored.content as Record<string, unknown>).heading).toBe('Real heading');

    const design = parseSectionDesign(stored.settings);
    expect(design.preset).toBe('brand');
    expect(design.desktop.padding.top).toBe('7rem');

    const bad = await updateSection(hero!.id, { content: { alignment: 'diagonal' } });
    expect(bad.ok).toBe(false);
  });

  it('reorders sections and rejects foreign ids', async () => {
    const sections = await prisma.pageSection.findMany({
      where: { pageId },
      orderBy: { sortOrder: 'asc' },
    });
    const reversed = [...sections].reverse().map((s) => s.id);

    const ok = await reorderSections({ pageId, order: reversed });
    expect(ok.ok).toBe(true);

    const after = await prisma.pageSection.findMany({ where: { pageId }, orderBy: { sortOrder: 'asc' } });
    expect(after.map((s) => s.id)).toEqual(reversed);

    const foreign = await reorderSections({ pageId, order: ['not-a-section-on-this-page'] });
    expect(foreign.ok).toBe(false);
  });

  it('duplicates, hides and removes a section', async () => {
    const before = await prisma.pageSection.count({ where: { pageId } });
    const [first] = await prisma.pageSection.findMany({ where: { pageId }, orderBy: { sortOrder: 'asc' } });

    const copy = await duplicateSection(first!.id);
    expect(copy.ok).toBe(true);
    expect(await prisma.pageSection.count({ where: { pageId } })).toBe(before + 1);

    await toggleSectionVisibility(first!.id);
    expect((await prisma.pageSection.findUniqueOrThrow({ where: { id: first!.id } })).isVisible).toBe(false);

    const copyId = (copy as { data: { id: string } }).data.id;
    await deleteSection(copyId);
    expect(await prisma.pageSection.count({ where: { pageId } })).toBe(before);
  });

  it('publishes the page and makes it public', async () => {
    const result = await setPageStatus(pageId, 'PUBLISHED');
    expect(result.ok).toBe(true);

    vi.resetModules();
    const { getPublishedPage: fresh } = await import('@/lib/services/pages');
    const page = await fresh(await ensureTestCountry(), `test-page-${suffix}`);
    expect(page?.title).toBe(`Test Page ${suffix}`);
    expect(page?.publishedAt).not.toBeNull();
  });

  it('refuses a slug already used by another page', async () => {
    const other = await createPage(formData({ title: `Other ${suffix}`, slug: `other-${suffix}` }));
    const otherId = (other as { data: { id: string } }).data.id;
    created.push(otherId);

    const clash = await updatePage(otherId, formData({ title: 'Other', slug: `test-page-${suffix}` }));
    expect(clash.ok).toBe(false);
    expect(clash.ok === false && clash.fieldErrors?.slug).toBeTruthy();
  });

  it('requires a publish date for a scheduled page', async () => {
    const result = await updatePage(
      pageId,
      formData({ title: `Test Page ${suffix}`, slug: `test-page-${suffix}`, status: 'SCHEDULED' }),
    );
    expect(result.ok).toBe(false);
  });

  it('duplicates a page with its sections as a draft', async () => {
    const result = await duplicatePage(pageId);
    expect(result.ok).toBe(true);
    const copyId = (result as { data: { id: string } }).data.id;
    created.push(copyId);

    const copy = await prisma.page.findUniqueOrThrow({
      where: { id: copyId },
      include: { sections: true },
    });
    const original = await prisma.page.findUniqueOrThrow({
      where: { id: pageId },
      include: { sections: true },
    });
    expect(copy.status).toBe('DRAFT');
    expect(copy.isHomepage).toBe(false);
    expect(copy.sections.length).toBe(original.sections.length);
  });

  it('soft-deletes a page and removes it from the public site', async () => {
    const result = await deletePage(pageId);
    expect(result.ok).toBe(true);

    const row = await prisma.page.findUniqueOrThrow({ where: { id: pageId } });
    expect(row.deletedAt).not.toBeNull();
    expect(row.slug).not.toBe(`test-page-${suffix}`);

    vi.resetModules();
    const { getPublishedPage: fresh } = await import('@/lib/services/pages');
    expect(await fresh(await ensureTestCountry(), `test-page-${suffix}`)).toBeNull();
  });

  it('refuses to delete the homepage', async () => {
    const homepage = await prisma.page.findFirst({ where: { isHomepage: true, deletedAt: null } });
    if (!homepage) return;
    const result = await deletePage(homepage.id);
    expect(result.ok).toBe(false);
  });
});
