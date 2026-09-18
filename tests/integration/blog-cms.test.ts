import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mockAuth, formData, uniqueSuffix, TEST_ACTOR, ensureTestCountry } from '../helpers';

mockAuth();

const { prisma } = await import('@/lib/db/prisma');
const { createBlogPost, updateBlogPost, saveBlogCategory } = await import('@/lib/actions/blog');
const { saveBlogTag } = await import('@/lib/actions/blog-tags');
const {
  ensureBlogSurface,
  addBlogSection,
  updateBlogSection,
  duplicateBlogSection,
  deleteBlogSection,
  reorderBlogSections,
  toggleBlogSectionVisibility,
  saveBlogSettings,
  copyGlobalSidebarToPost,
  clearPostSidebar,
} = await import('@/lib/actions/blog-layout');
const { getBlogSections, getBlogSettings, getSidebarForPost } = await import(
  '@/lib/services/blog-cms'
);
const {
  listPosts,
  resolvePostSource,
  getRelatedPosts,
  getAdjacentPosts,
  getBlogCategories,
  getPublishedPost,
  categoryIdsWithChildren,
} = await import('@/lib/services/blog');
const { parsePostOptions } = await import('@/lib/cms/blog-settings');
const { DEFAULT_BLOG_CARD } = await import('@/lib/cms/blog-settings');

const suffix = uniqueSuffix();
const postIds: string[] = [];
/** The market these fixtures live in; resolved in beforeAll. */
let COUNTRY_ID = 'country_in';
let parentCategoryId = '';
let childCategoryId = '';

async function makePost(input: Record<string, unknown>): Promise<string> {
  const result = await createBlogPost(formData(input));
  expect(result.ok, JSON.stringify(result)).toBe(true);
  const id = (result as { data: { id: string } }).data.id;
  postIds.push(id);
  return id;
}

beforeAll(async () => {
  COUNTRY_ID = await ensureTestCountry();
  const role = await prisma.userRole.upsert({
    where: { slug: 'test-role-blog-cms' },
    update: {},
    create: { slug: 'test-role-blog-cms', name: 'Test Role Blog CMS', rank: 5 },
  });
  await prisma.user.upsert({
    where: { id: TEST_ACTOR.id },
    update: {},
    create: { id: TEST_ACTOR.id, email: TEST_ACTOR.email, name: TEST_ACTOR.name, roleId: role.id },
  });

  const parent = await saveBlogCategory(
    null,
    formData({ name: `Cloud ${suffix}`, slug: `cloud-${suffix}` }),
  );
  parentCategoryId = (parent as { data: { id: string } }).data.id;

  const child = await saveBlogCategory(
    null,
    formData({ name: `Storage ${suffix}`, slug: `storage-${suffix}`, parentId: parentCategoryId }),
  );
  childCategoryId = (child as { data: { id: string } }).data.id;
});

afterAll(async () => {
  await prisma.blogSection.deleteMany({ where: { postId: { in: postIds } } });
  await prisma.blogPost.deleteMany({ where: { id: { in: postIds } } });
  await prisma.blogCategory.deleteMany({
    where: { id: { in: [childCategoryId, parentCategoryId] } },
  });
  await prisma.blogTag.deleteMany({ where: { slug: { contains: suffix } } });
  await prisma.auditLog.deleteMany({ where: { actorId: TEST_ACTOR.id } });
  await prisma.user.deleteMany({ where: { id: TEST_ACTOR.id } });
  await prisma.userRole.deleteMany({ where: { slug: 'test-role-blog-cms' } });
  await prisma.$disconnect();
});

describe('blog surfaces', () => {
  it('renders a built-in arrangement before anything has been configured', async () => {
    await prisma.blogSection.deleteMany({ where: { surface: 'LISTING', postId: null } });
    const sections = await getBlogSections('LISTING');
    expect(sections.length).toBeGreaterThan(0);
    expect(sections.map((section) => section.blockType)).toContain('blogGrid');
  });

  it('materialises that arrangement as editable rows on first use', async () => {
    await prisma.blogSection.deleteMany({ where: { surface: 'LISTING', postId: null } });
    const before = await prisma.blogSection.count({ where: { surface: 'LISTING', postId: null } });
    expect(before).toBe(0);

    expect((await ensureBlogSurface('LISTING')).ok).toBe(true);
    const after = await prisma.blogSection.findMany({
      where: { surface: 'LISTING', postId: null },
      orderBy: { sortOrder: 'asc' },
    });
    expect(after.length).toBeGreaterThan(0);
    expect(after[0]?.blockType).toBe('blogHero');

    // Running it again must not duplicate the set.
    await ensureBlogSurface('LISTING');
    expect(await prisma.blogSection.count({ where: { surface: 'LISTING', postId: null } })).toBe(
      after.length,
    );
  });

  it('adds, reorders, hides and removes a section', async () => {
    const added = await addBlogSection({ surface: 'LISTING', blockType: 'blogSearch' });
    expect(added.ok).toBe(true);
    const sectionId = (added as { data: { id: string } }).data.id;

    const rows = await prisma.blogSection.findMany({
      where: { surface: 'LISTING', postId: null },
      orderBy: { sortOrder: 'asc' },
    });
    const reversed = [...rows].reverse().map((row) => row.id);
    expect((await reorderBlogSections({ surface: 'LISTING', postId: null, order: reversed })).ok)
      .toBe(true);

    const afterReorder = await prisma.blogSection.findMany({
      where: { surface: 'LISTING', postId: null },
      orderBy: { sortOrder: 'asc' },
    });
    expect(afterReorder.map((row) => row.id)).toEqual(reversed);

    expect((await toggleBlogSectionVisibility(sectionId)).ok).toBe(true);
    expect(
      (await prisma.blogSection.findUnique({ where: { id: sectionId } }))?.isVisible,
    ).toBe(false);
    // A hidden section disappears from the public read but stays editable.
    const visible = (await getBlogSections('LISTING')).filter((row) => row.isVisible);
    expect(visible.map((row) => row.id)).not.toContain(sectionId);

    expect((await deleteBlogSection(sectionId)).ok).toBe(true);
    expect(await prisma.blogSection.findUnique({ where: { id: sectionId } })).toBeNull();
  });

  it('rejects a reorder that names a section from another surface', async () => {
    const listing = await prisma.blogSection.findFirst({
      where: { surface: 'LISTING', postId: null },
    });
    const result = await reorderBlogSections({
      surface: 'SIDEBAR',
      postId: null,
      order: [listing!.id],
    });
    expect(result.ok).toBe(false);
  });

  it('refuses a block that does not belong on the surface', async () => {
    const result = await addBlogSection({ surface: 'SIDEBAR', blockType: 'blogHero' });
    expect(result.ok).toBe(false);
    const unknown = await addBlogSection({ surface: 'LISTING', blockType: 'notARealBlock' });
    expect(unknown.ok).toBe(false);
  });

  it('allows only one of a singleton block and refuses to duplicate it', async () => {
    await prisma.blogSection.deleteMany({ where: { surface: 'ARTICLE', postId: null } });
    const first = await addBlogSection({ surface: 'ARTICLE', blockType: 'articleContent' });
    expect(first.ok).toBe(true);

    const second = await addBlogSection({ surface: 'ARTICLE', blockType: 'articleContent' });
    expect(second.ok).toBe(false);

    const copy = await duplicateBlogSection((first as { data: { id: string } }).data.id);
    expect(copy.ok).toBe(false);

    await prisma.blogSection.deleteMany({ where: { surface: 'ARTICLE', postId: null } });
  });

  it('duplicates a repeatable section without copying its anchor', async () => {
    const added = await addBlogSection({ surface: 'LISTING', blockType: 'blogGrid' });
    const sectionId = (added as { data: { id: string } }).data.id;

    await updateBlogSection(sectionId, {
      name: 'Latest',
      content: { heading: 'Latest articles', limit: 6 },
      settings: { anchorId: 'latest' },
    });

    const copy = await duplicateBlogSection(sectionId);
    expect(copy.ok).toBe(true);
    const copyId = (copy as { data: { id: string } }).data.id;

    const row = await prisma.blogSection.findUnique({ where: { id: copyId } });
    expect((row?.content as { heading: string }).heading).toBe('Latest articles');
    // Two elements cannot share one DOM id.
    expect((row?.settings as { anchorId: string }).anchorId).toBe('');
    expect(row?.name).toBe('Latest (copy)');

    await deleteBlogSection(copyId);
    await deleteBlogSection(sectionId);
  });

  it('refuses two sections claiming the same anchor', async () => {
    const a = await addBlogSection({ surface: 'LISTING', blockType: 'blogGrid' });
    const b = await addBlogSection({ surface: 'LISTING', blockType: 'blogGrid' });
    const aId = (a as { data: { id: string } }).data.id;
    const bId = (b as { data: { id: string } }).data.id;

    expect((await updateBlogSection(aId, { settings: { anchorId: 'articles' } })).ok).toBe(true);
    const clash = await updateBlogSection(bId, { settings: { anchorId: 'articles' } });
    expect(clash.ok).toBe(false);

    await deleteBlogSection(aId);
    await deleteBlogSection(bId);
  });

  it('validates section content against the block schema', async () => {
    const added = await addBlogSection({ surface: 'LISTING', blockType: 'blogGrid' });
    const sectionId = (added as { data: { id: string } }).data.id;

    await updateBlogSection(sectionId, { content: { columns: 99, source: 'nonsense' } });
    const row = await prisma.blogSection.findUnique({ where: { id: sectionId } });
    const content = row?.content as { columns: number; source: string };
    expect(content.columns).toBeLessThanOrEqual(4);
    expect(content.source).toBe('latest');

    await deleteBlogSection(sectionId);
  });
});

describe('blog design settings', () => {
  it('round-trips through the singleton and repairs invalid values', async () => {
    const result = await saveBlogSettings({
      postsPerPage: 12,
      card: { ...DEFAULT_BLOG_CARD, showExcerpt: false, radius: '20px' },
      layout: { sidebarPosition: 'left', sidebarWidth: '25%', mobileSidebar: 'hidden' },
      share: { enabled: true, facebook: false },
      typography: { articleTitle: { size: '42px' } },
      seoTitle: 'Insights',
      seoDescription: null,
      canonicalUrl: null,
      ogTitle: null,
      ogDescription: null,
      ogImageId: null,
      noIndex: false,
      noFollow: false,
    });
    expect(result.ok, JSON.stringify(result)).toBe(true);

    const settings = await getBlogSettings();
    expect(settings.postsPerPage).toBe(12);
    expect(settings.card.showExcerpt).toBe(false);
    expect(settings.card.radius).toBe('20px');
    expect(settings.layout.sidebarPosition).toBe('left');
    expect(settings.layout.mobileSidebar).toBe('hidden');
    expect(settings.share.facebook).toBe(false);
    expect(settings.typography.articleTitle.size).toBe('42px');
    expect(settings.seoTitle).toBe('Insights');
  });
});

describe('per-post configuration', () => {
  it('stores display overrides, forms and the sidebar choice', async () => {
    const id = await makePost({
      title: `Options ${suffix}`,
      content: '<p>Body</p>',
      status: 'PUBLISHED',
      subtitle: 'A standfirst',
      sidebarMode: 'CUSTOM',
      options: {
        showToc: 'hide',
        showAuthorBox: 'show',
        sidebarFormSlug: 'contact',
        bottomFormSlug: 'newsletter',
      },
    });

    const post = await prisma.blogPost.findUniqueOrThrow({ where: { id } });
    const options = parsePostOptions(post.options);
    expect(post.subtitle).toBe('A standfirst');
    expect(post.sidebarMode).toBe('CUSTOM');
    expect(options.showToc).toBe('hide');
    expect(options.showAuthorBox).toBe('show');
    expect(options.showShare).toBe('default');
    expect(options.sidebarFormSlug).toBe('contact');
  });

  it('leaves a post written before these controls existed fully on the defaults', async () => {
    const id = await makePost({ title: `Legacy ${suffix}`, content: '<p>Body</p>' });
    await prisma.blogPost.update({ where: { id }, data: { options: {} } });
    const post = await prisma.blogPost.findUniqueOrThrow({ where: { id } });
    const options = parsePostOptions(post.options);
    expect(Object.values(options).every((value) => value === 'default' || value === '')).toBe(true);
  });

  it('copies the global sidebar onto a post and detaches it again', async () => {
    await ensureBlogSurface('SIDEBAR');
    const id = await makePost({
      title: `Sidebar ${suffix}`,
      content: '<p>Body</p>',
      status: 'PUBLISHED',
      sidebarMode: 'CUSTOM',
    });

    expect((await copyGlobalSidebarToPost(id)).ok).toBe(true);
    const own = await prisma.blogSection.findMany({ where: { surface: 'SIDEBAR', postId: id } });
    const global = await prisma.blogSection.findMany({
      where: { surface: 'SIDEBAR', postId: null },
    });
    expect(own.length).toBe(global.length);
    expect(own.length).toBeGreaterThan(0);

    // Editing the copy must not touch the global sidebar.
    await updateBlogSection(own[0]!.id, { content: { title: 'Only here' } });
    const globalAfter = await prisma.blogSection.findUnique({ where: { id: global[0]!.id } });
    expect((globalAfter?.content as { title?: string }).title).not.toBe('Only here');

    // A second copy is refused rather than doubling the widgets.
    expect((await copyGlobalSidebarToPost(id)).ok).toBe(false);

    const resolved = await getSidebarForPost({ id, sidebarMode: 'CUSTOM' });
    expect(resolved.length).toBe(own.length);

    expect((await clearPostSidebar(id)).ok).toBe(true);
    expect(await prisma.blogSection.count({ where: { surface: 'SIDEBAR', postId: id } })).toBe(0);
  });

  it('falls back to the global sidebar for a post switched to custom with no widgets', async () => {
    await ensureBlogSurface('SIDEBAR');
    const id = await makePost({
      title: `Empty sidebar ${suffix}`,
      content: '<p>Body</p>',
      status: 'PUBLISHED',
      sidebarMode: 'CUSTOM',
    });
    const resolved = await getSidebarForPost({ id, sidebarMode: 'CUSTOM' });
    expect(resolved.length).toBeGreaterThan(0);
  });

  it('gives a post set to NONE no sidebar at all', async () => {
    const id = await makePost({ title: `No sidebar ${suffix}`, content: '<p>Body</p>' });
    expect(await getSidebarForPost({ id, sidebarMode: 'NONE' })).toEqual([]);
  });

  it('deletes a post’s own widgets with the post', async () => {
    const id = await makePost({
      title: `Cascade ${suffix}`,
      content: '<p>Body</p>',
      sidebarMode: 'CUSTOM',
    });
    await addBlogSection({ surface: 'SIDEBAR', postId: id, blockType: 'widgetSearch' });
    expect(await prisma.blogSection.count({ where: { postId: id } })).toBe(1);

    await prisma.blogPost.delete({ where: { id } });
    postIds.splice(postIds.indexOf(id), 1);
    expect(await prisma.blogSection.count({ where: { postId: id } })).toBe(0);
  });
});

describe('post sources', () => {
  const base = {
    source: 'latest' as const,
    categoryId: null,
    includeChildCategories: true,
    tagId: null,
    postIds: [] as string[],
    limit: 10,
    orderBy: 'publishedAt' as const,
    orderDir: 'desc' as const,
    excludeCurrent: false,
    excludeIds: [] as string[],
  };

  let featuredId = '';
  let childPostId = '';

  beforeAll(async () => {
    featuredId = await makePost({
      title: `Featured ${suffix}`,
      content: '<p>Featured body</p>',
      status: 'PUBLISHED',
      isFeatured: true,
      featuredPriority: 1,
      categoryId: parentCategoryId,
      tags: [`Migration ${suffix}`],
    });
    childPostId = await makePost({
      title: `Child ${suffix}`,
      content: '<p>Child body</p>',
      status: 'PUBLISHED',
      categoryId: childCategoryId,
    });
    await makePost({
      title: `Draft ${suffix}`,
      content: '<p>Draft body</p>',
      status: 'DRAFT',
      categoryId: parentCategoryId,
    });
  });

  it('never returns an unpublished post', async () => {
    const posts = await resolvePostSource(COUNTRY_ID, { ...base, limit: 24 });
    expect(posts.some((post) => post.title.startsWith('Draft '))).toBe(false);
  });

  it('returns only featured posts for the featured source', async () => {
    const posts = await resolvePostSource(COUNTRY_ID, { ...base, source: 'featured' });
    expect(posts.every((post) => post.isFeatured)).toBe(true);
    expect(posts.map((post) => post.id)).toContain(featuredId);
  });

  it('keeps the administrator’s order for a hand-picked list', async () => {
    const chosen = [childPostId, featuredId];
    const posts = await resolvePostSource(COUNTRY_ID, { ...base, source: 'manual', postIds: chosen });
    expect(posts.map((post) => post.id)).toEqual(chosen);
  });

  it('includes subcategory articles in a parent category archive', async () => {
    const ids = await categoryIdsWithChildren(parentCategoryId);
    expect(ids).toContain(childCategoryId);

    const { posts } = await listPosts({ categoryIds: ids, perPage: 24 });
    expect(posts.map((post) => post.id)).toContain(childPostId);

    const direct = await listPosts({ categoryIds: [parentCategoryId], perPage: 24 });
    expect(direct.posts.map((post) => post.id)).not.toContain(childPostId);
  });

  it('filters by tag', async () => {
    const tag = await prisma.blogTag.findFirstOrThrow({ where: { slug: `migration-${suffix}` } });
    const posts = await resolvePostSource(COUNTRY_ID, { ...base, source: 'tag', tagId: tag.id });
    expect(posts.map((post) => post.id)).toContain(featuredId);
  });

  it('excludes the article being read and any explicit exclusions', async () => {
    const posts = await resolvePostSource(
      COUNTRY_ID,
      { ...base, excludeCurrent: true, excludeIds: [childPostId], limit: 24 },
      { currentPostId: featuredId },
    );
    const ids = posts.map((post) => post.id);
    expect(ids).not.toContain(featuredId);
    expect(ids).not.toContain(childPostId);
  });

  it('returns an empty list for a hand-picked source with nothing picked', async () => {
    expect(await resolvePostSource(COUNTRY_ID, { ...base, source: 'manual' })).toEqual([]);
  });

  it('searches titles, excerpts, body, categories and tags', async () => {
    const byTitle = await listPosts({ query: `Featured ${suffix}`, perPage: 24 });
    expect(byTitle.posts.map((post) => post.id)).toContain(featuredId);

    const byBody = await listPosts({ query: 'Child body', perPage: 24 });
    expect(byBody.posts.map((post) => post.id)).toContain(childPostId);

    const byCategory = await listPosts({ query: `Storage ${suffix}`, perPage: 24 });
    expect(byCategory.posts.map((post) => post.id)).toContain(childPostId);

    const byTag = await listPosts({ query: `Migration ${suffix}`, perPage: 24 });
    expect(byTag.posts.map((post) => post.id)).toContain(featuredId);
  });

  it('paginates server-side rather than loading the whole blog', async () => {
    const first = await listPosts({ perPage: 1, page: 1 });
    const second = await listPosts({ perPage: 1, page: 2 });
    expect(first.posts).toHaveLength(1);
    expect(second.posts).toHaveLength(1);
    expect(first.posts[0]?.id).not.toBe(second.posts[0]?.id);
    expect(first.pages).toBe(second.pages);
    expect(first.total).toBeGreaterThan(1);
  });

  it('falls back through category, tags and recency for related articles', async () => {
    const related = await getRelatedPosts({
      countryId: COUNTRY_ID,
      postId: featuredId,
      categoryId: parentCategoryId,
      limit: 3,
    });
    expect(related.map((post) => post.id)).not.toContain(featuredId);
    expect(related.length).toBeGreaterThan(0);
    // The same article must never appear twice across the fallbacks.
    expect(new Set(related.map((post) => post.id)).size).toBe(related.length);
  });

  it('walks to the neighbouring articles by publish date', async () => {
    const post = await prisma.blogPost.findUniqueOrThrow({ where: { id: featuredId } });
    const { previous, next } = await getAdjacentPosts({
      countryId: COUNTRY_ID,
      postId: post.id,
      publishedAt: post.publishedAt,
      categoryId: post.categoryId,
      sameCategory: false,
    });
    for (const neighbour of [previous, next]) {
      if (neighbour) expect(neighbour.id).not.toBe(featuredId);
    }
  });

  it('counts a parent category including its subcategories', async () => {
    const categories = await getBlogCategories(COUNTRY_ID);
    const parent = categories.find((category) => category.id === parentCategoryId);
    const child = categories.find((category) => category.id === childCategoryId);
    expect(child?.count).toBe(1);
    expect(parent?.count).toBe((child?.count ?? 0) + 1);
  });

  it('hides a deactivated category from the filters without breaking its archive', async () => {
    await saveBlogCategory(
      childCategoryId,
      formData({
        name: `Storage ${suffix}`,
        slug: `storage-${suffix}`,
        parentId: parentCategoryId,
        isActive: 'false',
      }),
    );
    const categories = await getBlogCategories(COUNTRY_ID);
    expect(categories.map((category) => category.id)).not.toContain(childCategoryId);

    // The archive itself still resolves, so an indexed URL keeps working.
    const stillThere = await prisma.blogCategory.findUnique({ where: { id: childCategoryId } });
    expect(stillThere?.slug).toBe(`storage-${suffix}`);

    await saveBlogCategory(
      childCategoryId,
      formData({
        name: `Storage ${suffix}`,
        slug: `storage-${suffix}`,
        parentId: parentCategoryId,
        isActive: 'true',
      }),
    );
  });
});

describe('tags', () => {
  it('stores a description, status and SEO without touching the posts using it', async () => {
    const tag = await prisma.blogTag.findFirstOrThrow({ where: { slug: `migration-${suffix}` } });
    const before = await prisma.blogPostTag.count({ where: { tagId: tag.id } });

    const result = await saveBlogTag(
      tag.id,
      formData({
        name: `Migration ${suffix}`,
        slug: `migration-${suffix}`,
        description: 'Everything about moving data.',
        isActive: 'false',
        seoTitle: 'Migration guides',
        noIndex: 'true',
      }),
    );
    expect(result.ok, JSON.stringify(result)).toBe(true);

    const updated = await prisma.blogTag.findUniqueOrThrow({ where: { id: tag.id } });
    expect(updated.description).toBe('Everything about moving data.');
    expect(updated.isActive).toBe(false);
    expect(updated.noIndex).toBe(true);
    expect(await prisma.blogPostTag.count({ where: { tagId: tag.id } })).toBe(before);
  });
});

describe('article rendering inputs', () => {
  it('loads an author profile complete enough for the author box', async () => {
    await prisma.user.update({
      where: { id: TEST_ACTOR.id },
      data: { jobTitle: 'Solutions Lead', bio: 'Ships Dropbox rollouts.', linkedinUrl: 'https://example.com/in' },
    });

    const id = await makePost({
      title: `Authored ${suffix}`,
      slug: `authored-${suffix}`,
      content: '<h2>Heading</h2><p>Body</p>',
      status: 'PUBLISHED',
      authorId: TEST_ACTOR.id,
    });
    const post = await prisma.blogPost.findUniqueOrThrow({ where: { id }, select: { slug: true } });

    const loaded = await getPublishedPost(COUNTRY_ID, post.slug);
    expect(loaded?.author?.jobTitle).toBe('Solutions Lead');
    expect(loaded?.author?.bio).toBe('Ships Dropbox rollouts.');
    expect(loaded?.author?.linkedinUrl).toBe('https://example.com/in');
  });

  it('sanitises article content on save', async () => {
    const id = await makePost({
      title: `Unsafe ${suffix}`,
      content: '<p onclick="steal()">Body</p><script>steal()</script><h2>Safe</h2>',
      status: 'PUBLISHED',
    });
    const post = await prisma.blogPost.findUniqueOrThrow({ where: { id } });
    expect(post.content).not.toContain('<script');
    expect(post.content).not.toContain('onclick');
    expect(post.content).toContain('<h2>Safe</h2>');
  });

  it('keeps the sanitiser applied when the content is edited', async () => {
    const id = await makePost({ title: `Edited ${suffix}`, content: '<p>Clean</p>' });
    const result = await updateBlogPost(
      id,
      formData({
        title: `Edited ${suffix}`,
        slug: `edited-${suffix}`,
        content: '<p>Still clean</p><iframe src="https://evil.test"></iframe>',
        status: 'DRAFT',
      }),
    );
    expect(result.ok).toBe(true);
    const post = await prisma.blogPost.findUniqueOrThrow({ where: { id } });
    expect(post.content).not.toContain('<iframe');
  });
});
