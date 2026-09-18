import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mockAuth, formData, uniqueSuffix, TEST_ACTOR, ensureTestCountry, testCountryContext } from '../helpers';

mockAuth();

const { prisma } = await import('@/lib/db/prisma');
const {
  createBlogPost,
  updateBlogPost,
  setBlogPostStatus,
  duplicateBlogPost,
  deleteBlogPost,
} = await import('@/lib/actions/blog');
const { saveRedirect, deleteRedirect, saveSeoSettings } = await import('@/lib/actions/seo');
const { getPublishedPost, listPosts } = await import('@/lib/services/blog');
const { findRedirect } = await import('@/lib/services/pages');

const suffix = uniqueSuffix();
const createdPosts: string[] = [];
const createdRedirects: string[] = [];

beforeAll(async () => {
  const role = await prisma.userRole.upsert({
    where: { slug: 'test-role-blog' },
    update: {},
    create: { slug: 'test-role-blog', name: 'Test Role Blog', rank: 5 },
  });
  await prisma.user.upsert({
    where: { id: TEST_ACTOR.id },
    update: {},
    create: { id: TEST_ACTOR.id, email: TEST_ACTOR.email, name: TEST_ACTOR.name, roleId: role.id },
  });
});

afterAll(async () => {
  await prisma.blogPost.deleteMany({ where: { id: { in: createdPosts } } });
  await prisma.redirect.deleteMany({ where: { id: { in: createdRedirects } } });
  await prisma.blogTag.deleteMany({ where: { slug: { contains: suffix } } });
  await prisma.auditLog.deleteMany({ where: { actorId: TEST_ACTOR.id } });
  await prisma.user.deleteMany({ where: { id: TEST_ACTOR.id } });
  await prisma.userRole.deleteMany({ where: { slug: 'test-role-blog' } });
  await prisma.$disconnect();
});

describe('blog lifecycle', () => {
  let postId = '';

  it('creates a draft post with generated reading time and excerpt', async () => {
    const body = `<p>${'word '.repeat(440)}</p>`;
    const result = await createBlogPost(
      formData({
        title: `Test Article ${suffix}`,
        content: body,
        status: 'DRAFT',
        tags: [`Tag A ${suffix}`, `Tag B ${suffix}`],
      }),
    );
    expect(result.ok).toBe(true);
    postId = (result as { data: { id: string } }).data.id;
    createdPosts.push(postId);

    const post = await prisma.blogPost.findUniqueOrThrow({
      where: { id: postId },
      include: { tags: { include: { tag: true } } },
    });
    expect(post.status).toBe('DRAFT');
    expect(post.readingTime).toBe(2); // 440 words at ~220 wpm
    expect(post.excerpt).toBeTruthy();
    expect(post.tags).toHaveLength(2);
  });

  it('sanitises script tags out of the content', async () => {
    const result = await updateBlogPost(
      postId,
      formData({
        title: `Test Article ${suffix}`,
        slug: `test-article-${suffix}`,
        content: '<p>Safe copy</p><script>alert(1)</script><img src=x onerror=alert(1)>',
      }),
    );
    expect(result.ok).toBe(true);

    const post = await prisma.blogPost.findUniqueOrThrow({ where: { id: postId } });
    expect(post.content).toContain('Safe copy');
    expect(post.content).not.toContain('script');
    expect(post.content).not.toContain('onerror');
  });

  it('keeps a draft post off the public blog', async () => {
    expect(await getPublishedPost(await ensureTestCountry(), `test-article-${suffix}`)).toBeNull();
  });

  it('publishes the post and lists it publicly', async () => {
    expect((await setBlogPostStatus(postId, 'PUBLISHED')).ok).toBe(true);

    const post = await prisma.blogPost.findUniqueOrThrow({ where: { id: postId } });
    expect(post.publishedAt).not.toBeNull();

    const { posts } = await listPosts({ query: suffix });
    expect(posts.some((p) => p.id === postId)).toBe(true);
  });

  it('hides a post scheduled for the future', async () => {
    const future = new Date(Date.now() + 7 * 86_400_000);
    const result = await createBlogPost(
      formData({
        title: `Future Article ${suffix}`,
        content: '<p>Not yet.</p>',
        status: 'SCHEDULED',
        publishedAt: future.toISOString().slice(0, 16),
      }),
    );
    expect(result.ok).toBe(true);
    const futureId = (result as { data: { id: string } }).data.id;
    createdPosts.push(futureId);

    const { posts } = await listPosts({ query: `Future Article ${suffix}` });
    expect(posts).toHaveLength(0);
  });

  it('requires a date for a scheduled post', async () => {
    const result = await createBlogPost(
      formData({ title: `No date ${suffix}`, content: '<p>x</p>', status: 'SCHEDULED' }),
    );
    expect(result.ok).toBe(false);
  });

  it('replaces tags rather than accumulating them', async () => {
    await updateBlogPost(
      postId,
      formData({
        title: `Test Article ${suffix}`,
        slug: `test-article-${suffix}`,
        content: '<p>Safe copy</p>',
        tags: [`Tag A ${suffix}`],
      }),
    );
    const post = await prisma.blogPost.findUniqueOrThrow({
      where: { id: postId },
      include: { tags: true },
    });
    expect(post.tags).toHaveLength(1);
  });

  it('never relates a post to itself', async () => {
    await updateBlogPost(
      postId,
      formData({
        title: `Test Article ${suffix}`,
        slug: `test-article-${suffix}`,
        content: '<p>Safe copy</p>',
        relatedIds: [postId],
      }),
    );
    expect(await prisma.blogPostRelation.count({ where: { sourceId: postId } })).toBe(0);
  });

  it('duplicates a post as an unpublished draft', async () => {
    const result = await duplicateBlogPost(postId);
    expect(result.ok).toBe(true);
    const copyId = (result as { data: { id: string } }).data.id;
    createdPosts.push(copyId);

    const copy = await prisma.blogPost.findUniqueOrThrow({ where: { id: copyId } });
    expect(copy.status).toBe('DRAFT');
    expect(copy.isFeatured).toBe(false);
    expect(copy.slug).not.toBe(`test-article-${suffix}`);
  });

  it('soft-deletes a post and removes it from the public blog', async () => {
    expect((await deleteBlogPost(postId)).ok).toBe(true);
    const post = await prisma.blogPost.findUniqueOrThrow({ where: { id: postId } });
    expect(post.deletedAt).not.toBeNull();
    expect(await getPublishedPost(await ensureTestCountry(), `test-article-${suffix}`)).toBeNull();
  });
});

describe('redirects', () => {
  it('creates a redirect and resolves it for a missing path', async () => {
    const result = await saveRedirect(
      null,
      formData({ source: `/old-${suffix}`, destination: `/new-${suffix}`, type: 'PERMANENT' }),
    );
    expect(result.ok).toBe(true);
    createdRedirects.push((result as { data: { id: string } }).data.id);

    const resolved = await findRedirect(`/old-${suffix}`);
    expect(resolved?.destination).toBe(`/new-${suffix}`);
    expect(resolved?.permanent).toBe(true);
  });

  it('normalises a path without a leading slash', async () => {
    const result = await saveRedirect(
      null,
      formData({ source: `bare-${suffix}`, destination: `/target-${suffix}` }),
    );
    expect(result.ok).toBe(true);
    const id = (result as { data: { id: string } }).data.id;
    createdRedirects.push(id);

    const row = await prisma.redirect.findUniqueOrThrow({ where: { id } });
    expect(row.source).toBe(`/bare-${suffix}`);
  });

  it('rejects a redirect that points at itself', async () => {
    const result = await saveRedirect(
      null,
      formData({ source: `/self-${suffix}`, destination: `/self-${suffix}` }),
    );
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error).toMatch(/itself/i);
  });

  it('rejects a redirect that would close a loop', async () => {
    const first = await saveRedirect(
      null,
      formData({ source: `/loop-a-${suffix}`, destination: `/loop-b-${suffix}` }),
    );
    createdRedirects.push((first as { data: { id: string } }).data.id);

    const second = await saveRedirect(
      null,
      formData({ source: `/loop-b-${suffix}`, destination: `/loop-a-${suffix}` }),
    );
    expect(second.ok).toBe(false);
    expect(second.ok === false && second.error).toMatch(/loop/i);
  });

  it('rejects a duplicate source path', async () => {
    const result = await saveRedirect(
      null,
      formData({ source: `/old-${suffix}`, destination: `/somewhere-else-${suffix}` }),
    );
    expect(result.ok).toBe(false);
  });

  it('ignores a disabled redirect', async () => {
    const created = await saveRedirect(
      null,
      formData({ source: `/disabled-${suffix}`, destination: `/live-${suffix}`, isActive: false }),
    );
    createdRedirects.push((created as { data: { id: string } }).data.id);

    expect(await findRedirect(`/disabled-${suffix}`)).toBeNull();
  });

  it('counts hits on resolution', async () => {
    await findRedirect(`/old-${suffix}`);
    const row = await prisma.redirect.findFirstOrThrow({ where: { source: `/old-${suffix}` } });
    expect(row.hitCount).toBeGreaterThan(0);
  });

  it('deletes a redirect', async () => {
    const id = createdRedirects.pop();
    if (!id) return;
    expect((await deleteRedirect(id)).ok).toBe(true);
    expect(await prisma.redirect.findUnique({ where: { id } })).toBeNull();
  });
});

describe('SEO settings', () => {
  it('rejects a title template without the %s placeholder', async () => {
    const result = await saveSeoSettings(
      formData({
        defaultTitle: 'Test',
        titleTemplate: 'No placeholder here',
        defaultDescription: 'Test',
        organizationName: 'Test',
      }),
    );
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.fieldErrors?.titleTemplate).toBeTruthy();
  });

  it('saves valid settings', async () => {
    const before = await prisma.seoSettings.findUnique({ where: { id: 'singleton' } });

    const result = await saveSeoSettings(
      formData({
        defaultTitle: `Title ${suffix}`,
        titleTemplate: '%s | Test',
        defaultDescription: 'A description.',
        organizationName: 'Test Org',
        organizationType: 'Organization',
        sitemapEnabled: true,
        noIndexSite: false,
      }),
    );
    expect(result.ok).toBe(true);

    const after = await prisma.seoSettings.findUniqueOrThrow({ where: { id: 'singleton' } });
    expect(after.defaultTitle).toBe(`Title ${suffix}`);

    // Restore whatever the seed put there so later runs are unaffected.
    if (before) {
      await prisma.seoSettings.update({ where: { id: 'singleton' }, data: before });
    }
  });
});
