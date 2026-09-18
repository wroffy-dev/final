import type { Metadata } from 'next';
import { prisma } from '@/lib/db/prisma';
import { requirePermission, userCan } from '@/lib/auth/guards';
import { AdminPageHeader } from '@/components/admin/page-header';
import { MediaLibrary } from '@/components/admin/media/media-library';
import { MEDIA_DTO_SELECT, toMediaDto, type MediaDto } from '@/lib/media/dto';
import { maxUploadLabel } from '@/lib/services/upload';

export const metadata: Metadata = { title: 'Media' };
export const dynamic = 'force-dynamic';

const PAGE_SIZE = 40;

export default async function MediaAdmin({
  searchParams,
}: {
  searchParams: Promise<{ selected?: string }>;
}) {
  const user = await requirePermission('media.view');
  const params = await searchParams;

  const rows = await prisma.media.findMany({
    where: { deletedAt: null },
    orderBy: { createdAt: 'desc' },
    take: PAGE_SIZE + 1,
    select: MEDIA_DTO_SELECT,
  });

  const hasMore = rows.length > PAGE_SIZE;
  const items: MediaDto[] = (hasMore ? rows.slice(0, PAGE_SIZE) : rows).map(toMediaDto);

  // Folder tree and the two synthetic buckets, counted on the server so the
  // sidebar shows real totals rather than only what this page happened to load.
  const [folderRows, totalCount, uncategorisedCount] = await Promise.all([
    prisma.mediaFolder.findMany({
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        parentId: true,
        _count: { select: { media: { where: { deletedAt: null } } } },
      },
    }),
    prisma.media.count({ where: { deletedAt: null } }),
    prisma.media.count({ where: { deletedAt: null, folderId: null } }),
  ]);

  const folders = folderRows.map((row) => ({
    id: row.id,
    name: row.name,
    parentId: row.parentId,
    fileCount: row._count.media,
  }));

  const usedBytes = await prisma.media.aggregate({
    where: { deletedAt: null },
    _sum: { size: true },
    _count: { _all: true },
  });

  return (
    <>
      <AdminPageHeader
        title="Media"
        description={`${usedBytes._count._all} file(s) · ${((usedBytes._sum.size ?? 0) / 1024 / 1024).toFixed(1)} MB stored`}
        crumbs={[{ label: 'Media' }]}
      />
      <MediaLibrary
        initialItems={items}
        initialFolders={folders}
        initialTotalCount={totalCount}
        initialUncategorisedCount={uncategorisedCount}
        initialCursor={hasMore ? (items[items.length - 1]?.id ?? null) : null}
        can={{
          upload: userCan(user, 'media.upload'),
          edit: userCan(user, 'media.edit'),
          delete: userCan(user, 'media.delete'),
        }}
        selectedId={params.selected}
        maxUploadLabel={maxUploadLabel()}
      />
    </>
  );
}
