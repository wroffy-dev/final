import 'server-only';
import { cache } from 'react';
import { prisma } from '@/lib/db/prisma';

export type ResolvedMedia = {
  id: string;
  url: string;
  altText: string;
  width: number | null;
  height: number | null;
};

/** Batched media lookup — avoids an N+1 when a section references many images. */
export const getMediaByIds = cache(async (ids: string[]): Promise<Map<string, ResolvedMedia>> => {
  const unique = Array.from(new Set(ids.filter(Boolean)));
  if (unique.length === 0) return new Map();

  const rows = await prisma.media.findMany({
    where: { id: { in: unique }, deletedAt: null },
    select: { id: true, url: true, altText: true, title: true, width: true, height: true },
  });

  return new Map(
    rows.map((row) => [
      row.id,
      {
        id: row.id,
        url: row.url,
        altText: row.altText ?? row.title ?? '',
        width: row.width,
        height: row.height,
      },
    ]),
  );
});

export const getMedia = cache(async (id: string | null | undefined): Promise<ResolvedMedia | null> => {
  if (!id) return null;
  const map = await getMediaByIds([id]);
  return map.get(id) ?? null;
});
