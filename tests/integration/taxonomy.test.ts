import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { mockAuth, uniqueSuffix, TEST_ACTOR, formData, ensureTestCountry } from '../helpers';

mockAuth();

const { prisma } = await import('@/lib/db/prisma');
const { savePageCategory, deletePageCategory, reorderPageCategories } =
  await import('@/lib/actions/page-categories');
const { saveBlogCategory, deleteBlogCategory } = await import('@/lib/actions/blog');
const { saveBlogTag, deleteBlogTag, bulkBlogTagAction } = await import('@/lib/actions/blog-tags');
const { saveMediaFolder, deleteMediaFolder, moveMediaToFolder } =
  await import('@/lib/actions/media-folders');

const suffix = uniqueSuffix();
const pageIds: string[] = [];
const mediaIds: string[] = [];

async function newCategory(name: string, parentId?: string) {
  const result = await savePageCategory(
    null,
    formData({ name: `${name} ${suffix}`, slug: '', parentId: parentId ?? '', sortOrder: '0' }),
  );
  expect(result.ok).toBe(true);
  return (result as { data: { id: string } }).data.id;
}

beforeAll(async () => {
  const role = await prisma.userRole.upsert({
    where: { slug: 'test-role-tax' },
    update: {},
    create: { slug: 'test-role-tax', name: 'Test Role Taxonomy', rank: 5 },
  });
  await prisma.user.upsert({
    where: { id: TEST_ACTOR.id },
    update: {},
    create: { id: TEST_ACTOR.id, email: TEST_ACTOR.email, name: TEST_ACTOR.name, roleId: role.id },
  });
});

beforeEach(async () => {
  await prisma.page.deleteMany({ where: { id: { in: pageIds } } });
  await prisma.media.deleteMany({ where: { id: { in: mediaIds } } });
  pageIds.length = 0;
  mediaIds.length = 0;
  await prisma.pageCategory.deleteMany({ where: { name: { contains: suffix } } });
  await prisma.mediaFolder.deleteMany({ where: { name: { contains: suffix } } });
  await prisma.blogCategory.deleteMany({ where: { name: { contains: suffix } } });
  await prisma.blogTag.deleteMany({ where: { name: { contains: suffix } } });
});

afterAll(async () => {
  await prisma.page.deleteMany({ where: { id: { in: pageIds } } });
  await prisma.media.deleteMany({ where: { id: { in: mediaIds } } });
  await prisma.pageCategory.deleteMany({ where: { name: { contains: suffix } } });
  await prisma.mediaFolder.deleteMany({ where: { name: { contains: suffix } } });
  await prisma.blogCategory.deleteMany({ where: { name: { contains: suffix } } });
  await prisma.blogTag.deleteMany({ where: { name: { contains: suffix } } });
  await prisma.auditLog.deleteMany({ where: { actorId: TEST_ACTOR.id } });
  await prisma.user.deleteMany({ where: { id: TEST_ACTOR.id } });
  await prisma.userRole.deleteMany({ where: { slug: 'test-role-tax' } });
  await prisma.$disconnect();
});

describe('page categories', () => {
  it('creates a category with a generated unique slug', async () => {
    const id = await newCategory('Solutions');
    const category = await prisma.pageCategory.findUniqueOrThrow({ where: { id } });
    expect(category.slug).toContain('solutions');

    // A second category of the same name gets a distinct slug, not a clash.
    const other = await newCategory('Solutions');
    const second = await prisma.pageCategory.findUniqueOrThrow({ where: { id: other } });
    expect(second.slug).not.toBe(category.slug);
  });

  it('nests categories to arbitrary depth', async () => {
    const solutions = await newCategory('Solutions');
    const cloud = await newCategory('Cloud', solutions);
    const backup = await newCategory('Backup', cloud);

    const row = await prisma.pageCategory.findUniqueOrThrow({
      where: { id: backup },
      include: { parent: { include: { parent: true } } },
    });
    expect(row.parent?.id).toBe(cloud);
    expect(row.parent?.parent?.id).toBe(solutions);
  });

  it('refuses a category as its own parent, and refuses a cycle', async () => {
    const solutions = await newCategory('Solutions');
    const cloud = await newCategory('Cloud', solutions);

    const itself = await savePageCategory(
      solutions,
      formData({ name: 'Solutions', slug: 'solutions-x', parentId: solutions, sortOrder: '0' }),
    );
    expect(itself.ok).toBe(false);

    // Solutions under its own child would be a loop.
    const cycle = await savePageCategory(
      solutions,
      formData({ name: 'Solutions', slug: 'solutions-y', parentId: cloud, sortOrder: '0' }),
    );
    expect(cycle.ok).toBe(false);
  });

  it('rejects a duplicate slug on edit rather than silently renaming', async () => {
    const a = await newCategory('Alpha');
    const b = await newCategory('Beta');
    const taken = await prisma.pageCategory.findUniqueOrThrow({ where: { id: a } });

    const result = await savePageCategory(
      b,
      formData({ name: 'Beta', slug: taken.slug, parentId: '', sortOrder: '0' }),
    );
    expect(result.ok).toBe(false);
  });

  it('assigns a category to a page and counts it', async () => {
    const id = await newCategory('Solutions');
    const page = await prisma.page.create({
      data: {
        countryId: await ensureTestCountry(),
        title: `Page ${suffix}`,
        slug: `page-${suffix}`,
        categoryId: id,
      },
    });
    pageIds.push(page.id);

    const category = await prisma.pageCategory.findUniqueOrThrow({
      where: { id },
      include: { _count: { select: { pages: true } } },
    });
    expect(category._count.pages).toBe(1);
  });

  it('never deletes pages with the category, leaving them uncategorised', async () => {
    const id = await newCategory('Solutions');
    const page = await prisma.page.create({
      data: {
        countryId: await ensureTestCountry(),
        title: `Kept ${suffix}`,
        slug: `kept-${suffix}`,
        categoryId: id,
      },
    });
    pageIds.push(page.id);

    const result = await deletePageCategory({ categoryId: id });
    expect(result.ok).toBe(true);

    const after = await prisma.page.findUniqueOrThrow({ where: { id: page.id } });
    expect(after.categoryId).toBeNull();
    expect(after.deletedAt).toBeNull();
  });

  it('optionally moves pages to another category on delete', async () => {
    const from = await newCategory('From');
    const to = await newCategory('To');
    const page = await prisma.page.create({
      data: {
        countryId: await ensureTestCountry(),
        title: `Moved ${suffix}`,
        slug: `moved-${suffix}`,
        categoryId: from,
      },
    });
    pageIds.push(page.id);

    expect((await deletePageCategory({ categoryId: from, movePagesTo: to })).ok).toBe(true);
    const after = await prisma.page.findUniqueOrThrow({ where: { id: page.id } });
    expect(after.categoryId).toBe(to);
  });

  it('promotes subcategories instead of orphaning them', async () => {
    const solutions = await newCategory('Solutions');
    const cloud = await newCategory('Cloud', solutions);
    const backup = await newCategory('Backup', cloud);

    expect((await deletePageCategory({ categoryId: cloud })).ok).toBe(true);

    // Backup rises to Cloud's own parent, not to the root.
    const after = await prisma.pageCategory.findUniqueOrThrow({ where: { id: backup } });
    expect(after.parentId).toBe(solutions);
  });

  it('persists a new display order', async () => {
    const a = await newCategory('A');
    const b = await newCategory('B');
    expect((await reorderPageCategories({ ids: [b, a] })).ok).toBe(true);

    const rows = await prisma.pageCategory.findMany({
      where: { id: { in: [a, b] } },
      orderBy: { sortOrder: 'asc' },
    });
    expect(rows[0].id).toBe(b);
  });
});

describe('blog category nesting', () => {
  async function newBlogCategory(name: string, parentId?: string) {
    const result = await saveBlogCategory(
      null,
      formData({ name: `${name} ${suffix}`, slug: '', parentId: parentId ?? '', sortOrder: '0' }),
    );
    expect(result.ok).toBe(true);
    return (result as { data: { id: string } }).data.id;
  }

  it('nests an existing-style category under a parent', async () => {
    const microsoft = await newBlogCategory('Microsoft');
    const azure = await newBlogCategory('Azure', microsoft);

    const row = await prisma.blogCategory.findUniqueOrThrow({
      where: { id: azure },
      include: { parent: true },
    });
    expect(row.parent?.id).toBe(microsoft);
  });

  it('leaves categories created without a parent at the top level', async () => {
    const id = await newBlogCategory('Standalone');
    const row = await prisma.blogCategory.findUniqueOrThrow({ where: { id } });
    // This is what keeps every pre-existing category and its URL working.
    expect(row.parentId).toBeNull();
  });

  it('refuses self-parenting and cycles', async () => {
    const microsoft = await newBlogCategory('Microsoft');
    const azure = await newBlogCategory('Azure', microsoft);

    expect(
      (
        await saveBlogCategory(
          microsoft,
          formData({ name: 'Microsoft', slug: '', parentId: microsoft }),
        )
      ).ok,
    ).toBe(false);
    expect(
      (
        await saveBlogCategory(
          microsoft,
          formData({ name: 'Microsoft', slug: '', parentId: azure }),
        )
      ).ok,
    ).toBe(false);
  });

  it('promotes children when a parent category is deleted', async () => {
    const microsoft = await newBlogCategory('Microsoft');
    const azure = await newBlogCategory('Azure', microsoft);

    expect((await deleteBlogCategory(microsoft)).ok).toBe(true);
    const after = await prisma.blogCategory.findUniqueOrThrow({ where: { id: azure } });
    expect(after.parentId).toBeNull();
  });
});

describe('blog tags', () => {
  async function newTag(name: string) {
    const result = await saveBlogTag(null, formData({ name: `${name} ${suffix}`, slug: '' }));
    expect(result.ok).toBe(true);
    return (result as { data: { id: string } }).data.id;
  }

  it('creates a tag manually with a unique slug', async () => {
    const first = await newTag('Cloud');
    const second = await newTag('Cloud');
    const rows = await prisma.blogTag.findMany({ where: { id: { in: [first, second] } } });
    expect(new Set(rows.map((row) => row.slug)).size).toBe(2);
  });

  it('renames a tag without touching its post links', async () => {
    const id = await newTag('Storage');
    const post = await prisma.blogPost.create({
      data: {
        countryId: await ensureTestCountry(),
        title: `Post ${suffix}`,
        slug: `post-tag-${suffix}`,
        content: '',
        excerpt: '',
      },
    });
    await prisma.blogPostTag.create({ data: { postId: post.id, tagId: id } });

    const renamed = await saveBlogTag(id, formData({ name: `Renamed ${suffix}`, slug: '' }));
    expect(renamed.ok).toBe(true);

    // The join row survives, so the post keeps the tag.
    expect(await prisma.blogPostTag.count({ where: { tagId: id } })).toBe(1);
    await prisma.blogPostTag.deleteMany({ where: { postId: post.id } });
    await prisma.blogPost.delete({ where: { id: post.id } });
  });

  it('rejects a duplicate slug on edit', async () => {
    const a = await newTag('Alpha');
    const b = await newTag('Beta');
    const taken = await prisma.blogTag.findUniqueOrThrow({ where: { id: a } });

    const result = await saveBlogTag(b, formData({ name: 'Beta', slug: taken.slug }));
    expect(result.ok).toBe(false);
  });

  it('deletes a tag and unlinks it from posts without deleting the posts', async () => {
    const id = await newTag('Temporary');
    const post = await prisma.blogPost.create({
      data: {
        countryId: await ensureTestCountry(),
        title: `Keep ${suffix}`,
        slug: `keep-tag-${suffix}`,
        content: '',
        excerpt: '',
      },
    });
    await prisma.blogPostTag.create({ data: { postId: post.id, tagId: id } });

    expect((await deleteBlogTag(id)).ok).toBe(true);
    expect(await prisma.blogTag.count({ where: { id } })).toBe(0);
    // The post itself is untouched.
    expect(await prisma.blogPost.count({ where: { id: post.id } })).toBe(1);
    await prisma.blogPost.delete({ where: { id: post.id } });
  });

  it('bulk-deletes only unused tags, protecting ones still in use', async () => {
    const used = await newTag('Used');
    const unused = await newTag('Unused');
    const post = await prisma.blogPost.create({
      data: {
        countryId: await ensureTestCountry(),
        title: `Bulk ${suffix}`,
        slug: `bulk-tag-${suffix}`,
        content: '',
        excerpt: '',
      },
    });
    await prisma.blogPostTag.create({ data: { postId: post.id, tagId: used } });

    const result = await bulkBlogTagAction({ ids: [used, unused], action: 'deleteUnused' });
    expect(result.ok).toBe(true);

    expect(await prisma.blogTag.count({ where: { id: used } })).toBe(1);
    expect(await prisma.blogTag.count({ where: { id: unused } })).toBe(0);

    await prisma.blogPostTag.deleteMany({ where: { postId: post.id } });
    await prisma.blogPost.delete({ where: { id: post.id } });
  });
});

describe('media folders', () => {
  async function newFolder(name: string, parentId?: string) {
    const result = await saveMediaFolder(null, {
      name: `${name} ${suffix}`,
      parentId: parentId ?? '',
    });
    expect(result.ok).toBe(true);
    return (result as { data: { id: string } }).data.id;
  }

  async function newMedia(folderId: string | null) {
    const item = await prisma.media.create({
      data: {
        filename: `f-${suffix}-${Math.random().toString(36).slice(2, 8)}.png`,
        storageKey: `k-${suffix}-${Math.random().toString(36).slice(2, 10)}`,
        url: `/uploads/${suffix}.png`,
        mimeType: 'image/png',
        size: 1024,
        folderId,
      },
    });
    mediaIds.push(item.id);
    return item;
  }

  it('nests folders without limit', async () => {
    const dropbox = await newFolder('Dropbox');
    const standard = await newFolder('Standard', dropbox);
    const deep = await newFolder('Deep', standard);

    const row = await prisma.mediaFolder.findUniqueOrThrow({
      where: { id: deep },
      include: { parent: { include: { parent: true } } },
    });
    expect(row.parent?.parent?.id).toBe(dropbox);
  });

  it('refuses a folder inside itself or inside its own subfolder', async () => {
    const parent = await newFolder('Parent');
    const child = await newFolder('Child', parent);

    expect((await saveMediaFolder(parent, { name: 'Parent', parentId: parent })).ok).toBe(false);
    expect((await saveMediaFolder(parent, { name: 'Parent', parentId: child })).ok).toBe(false);
  });

  it('refuses two folders with the same name under one parent', async () => {
    const parent = await newFolder('Parent');
    await saveMediaFolder(null, { name: `Dup ${suffix}`, parentId: parent });
    const second = await saveMediaFolder(null, { name: `Dup ${suffix}`, parentId: parent });
    expect(second.ok).toBe(false);
  });

  it('moves media between folders without altering the file', async () => {
    const from = await newFolder('From');
    const to = await newFolder('To');
    const item = await newMedia(from);

    expect((await moveMediaToFolder({ mediaIds: [item.id], folderId: to })).ok).toBe(true);

    const after = await prisma.media.findUniqueOrThrow({ where: { id: item.id } });
    expect(after.folderId).toBe(to);
    // The identity and public URL must be exactly what they were.
    expect(after.storageKey).toBe(item.storageKey);
    expect(after.url).toBe(item.url);
  });

  it('moves media to Uncategorised when given no folder', async () => {
    const folder = await newFolder('Temp');
    const item = await newMedia(folder);

    expect((await moveMediaToFolder({ mediaIds: [item.id], folderId: null })).ok).toBe(true);
    const after = await prisma.media.findUniqueOrThrow({ where: { id: item.id } });
    expect(after.folderId).toBeNull();
  });

  it('never deletes files when a folder is deleted', async () => {
    const parent = await newFolder('Parent');
    const child = await newFolder('Child', parent);
    const item = await newMedia(child);
    const grandchild = await newFolder('Grandchild', child);

    expect((await deleteMediaFolder(child)).ok).toBe(true);

    // The file survives and moves up to the deleted folder's parent.
    const after = await prisma.media.findUniqueOrThrow({ where: { id: item.id } });
    expect(after.deletedAt).toBeNull();
    expect(after.folderId).toBe(parent);

    // So does the subfolder.
    const sub = await prisma.mediaFolder.findUniqueOrThrow({ where: { id: grandchild } });
    expect(sub.parentId).toBe(parent);
  });

  it('sends files to Uncategorised when a top-level folder is deleted', async () => {
    const folder = await newFolder('TopLevel');
    const item = await newMedia(folder);

    expect((await deleteMediaFolder(folder)).ok).toBe(true);
    const after = await prisma.media.findUniqueOrThrow({ where: { id: item.id } });
    expect(after.folderId).toBeNull();
    expect(after.deletedAt).toBeNull();
  });
});
