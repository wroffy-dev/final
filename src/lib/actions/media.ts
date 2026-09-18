'use server';

import path from 'node:path';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { prisma } from '@/lib/db/prisma';
import { authorize } from '@/lib/auth/guards';
import { storage } from '@/lib/storage';
import { recordAudit } from '@/lib/services/audit';
import {
  validateUpload,
  buildStorageKey,
  mediaSlug,
  readImageDimensions,
  maxUploadBytes,
  tooLargeError,
} from '@/lib/services/upload';
import { randomToken } from '@/lib/utils/crypto';
import { safeStorageKey } from '@/lib/storage';
import { MEDIA_DTO_SELECT, slugOfKey, toMediaDto, type MediaDto } from '@/lib/media/dto';
import { sanitizeText } from '@/lib/utils/sanitize';
import { success, failure, toActionError, type ActionResult } from '@/lib/utils/result';
import type { MediaKind } from '@prisma/client';

export type { MediaDto } from '@/lib/media/dto';

export async function uploadMedia(formData: FormData): Promise<ActionResult<MediaDto>> {
  try {
    const user = await authorize('media.upload');

    const file = formData.get('file');
    if (!(file instanceof File)) return failure('No file was received.');
    // Early reject on the declared size so an oversized body is not buffered
    // into memory; validateUpload re-checks the real byte length after read.
    if (file.size > maxUploadBytes()) return failure(tooLargeError());

    const buffer = Buffer.from(await file.arrayBuffer());
    const validation = validateUpload(file.type, buffer, buffer.byteLength);
    if (!validation.ok) return failure(validation.error);

    const key = buildStorageKey(file.name, validation.extension);
    const stored = await storage().put({ key, body: buffer, mimeType: validation.mimeType });
    const dimensions =
      validation.kind === 'IMAGE' ? readImageDimensions(buffer, validation.mimeType) : null;

    const media = await prisma.media.create({
      data: {
        filename: sanitizeText(file.name).slice(0, 200) || 'upload',
        storageKey: stored.key,
        url: stored.url,
        provider: stored.provider,
        mimeType: validation.mimeType,
        kind: validation.kind,
        size: buffer.byteLength,
        width: dimensions?.width ?? null,
        height: dimensions?.height ?? null,
        altText: sanitizeText(String(formData.get('altText') ?? '')) || null,
        title: sanitizeText(String(formData.get('title') ?? '')) || null,
        uploadedById: user.id,
      },
    });

    await recordAudit({
      actor: user,
      action: 'uploaded',
      entity: 'Media',
      entityId: media.id,
      summary: `Uploaded ${media.filename}`,
    });

    revalidatePath('/admin/media');
    return success(toMediaDto(media), 'File uploaded.');
  } catch (error) {
    return toActionError(error);
  }
}

const metadataSchema = z.object({
  id: z.string().min(1),
  altText: z.string().max(300).optional().nullable(),
  title: z.string().max(200).optional().nullable(),
  caption: z.string().max(1000).optional().nullable(),
  description: z.string().max(2000).optional().nullable(),
});

export async function updateMediaMetadata(input: unknown): Promise<ActionResult> {
  try {
    const user = await authorize('media.edit');
    const data = metadataSchema.parse(input);

    await prisma.media.update({
      where: { id: data.id },
      data: {
        altText: data.altText ? sanitizeText(data.altText) : null,
        title: data.title ? sanitizeText(data.title) : null,
        caption: data.caption ? sanitizeText(data.caption) : null,
        description: data.description ? sanitizeText(data.description) : null,
      },
    });

    await recordAudit({ actor: user, action: 'updated', entity: 'Media', entityId: data.id });
    revalidatePath('/admin/media');
    return success(undefined, 'Details saved.');
  } catch (error) {
    return toActionError(error);
  }
}

const renameSchema = z.object({
  id: z.string().min(1),
  filename: z.string().trim().min(1, 'A file name is required').max(200),
  slug: z.string().trim().min(1, 'A URL slug is required').max(120),
});

/**
 * A storage key in the same directory as `currentKey`, carrying `slug`.
 *
 * The extension is taken from the existing key and never from the name typed
 * in: the extension decides the Content-Type the file is served with, so
 * letting it be edited would let a PNG be re-labelled as an SVG and served as
 * one. The directory is kept too, so a rename never reshuffles the date-based
 * layout the uploader builds.
 *
 * Returns null when no safe, free key could be formed.
 */
async function uniqueStorageKey(
  currentKey: string,
  slug: string,
  mediaId: string,
): Promise<string | null> {
  const extension = path.posix.extname(currentKey);
  const directory = path.posix.dirname(currentKey);
  const prefix = directory === '.' || directory === '' ? '' : `${directory}/`;

  for (let attempt = 0; attempt < 5; attempt += 1) {
    // The plain slug first, so the admin gets the URL they asked for; a
    // suffix only appears when that name is genuinely taken.
    const stem = attempt === 0 ? slug : `${slug}-${randomToken(6)}`;
    const candidate = `${prefix}${stem}${extension}`;

    // The same allowlist the uploader and the serving route use. A name that
    // cannot survive it never reaches the disk.
    if (!safeStorageKey(candidate)) return null;

    const clash = await prisma.media.findFirst({
      where: { storageKey: candidate, NOT: { id: mediaId } },
      select: { id: true },
    });
    if (clash) continue;

    // A file with no row is still somebody's file — never overwrite it.
    if (await storage().exists(candidate)) continue;

    return candidate;
  }

  return null;
}

/**
 * Renames a media item.
 *
 * Two different things, saved together because they are one intention: the
 * name shown in the library, and the slug the public URL is built from.
 * Changing the slug moves the stored object and rewrites the row, so the old
 * URL stops resolving — every CMS reference made through the media picker is
 * by id and follows automatically, but a URL typed by hand into rich text does
 * not, which is what the returned message warns about.
 *
 * The object is moved before the row is written, and moved back if the write
 * fails. The alternative ordering leaves a row pointing at a key with no file
 * behind it, which is the one outcome that shows up as a broken image on a
 * live page.
 */
export async function renameMedia(input: unknown): Promise<ActionResult<MediaDto>> {
  try {
    const user = await authorize('media.edit');
    const data = renameSchema.parse(input);

    const media = await prisma.media.findFirst({ where: { id: data.id, deletedAt: null } });
    if (!media) return failure('That file no longer exists.');

    const filename = sanitizeText(data.filename).slice(0, 200) || media.filename;
    const slug = mediaSlug(data.slug);
    if (!slug) return failure('The URL slug needs at least one letter or number.');

    const currentSlug = slugOfKey(media.storageKey);
    const slugChanged = slug !== currentSlug;

    if (!slugChanged && filename === media.filename) {
      return success(toMediaDto(media), 'Nothing to change.');
    }

    let storageKey = media.storageKey;
    let url = media.url;

    if (slugChanged) {
      const service = storage();
      if (media.provider !== service.provider) {
        return failure(
          `This file is stored on ${media.provider} and ${service.provider} is configured, ` +
            'so it cannot be moved from here. Its name can still be changed.',
        );
      }

      const nextKey = await uniqueStorageKey(media.storageKey, slug, media.id);
      if (!nextKey) return failure('That slug cannot be used for a file name.');

      await service.move(media.storageKey, nextKey);
      storageKey = nextKey;
      url = service.publicUrl(nextKey);
    }

    let updated;
    try {
      updated = await prisma.media.update({
        where: { id: media.id },
        data: { filename, storageKey, url },
        select: MEDIA_DTO_SELECT,
      });
    } catch (error) {
      if (slugChanged) {
        // Put the object back, so the row and the disk still agree.
        await storage()
          .move(storageKey, media.storageKey)
          .catch(() => undefined);
      }
      throw error;
    }

    await recordAudit({
      actor: user,
      action: 'renamed',
      entity: 'Media',
      entityId: media.id,
      summary: slugChanged
        ? `Renamed ${media.filename} to ${filename}; URL slug ${currentSlug} → ${slug}`
        : `Renamed ${media.filename} to ${filename}`,
    });

    revalidatePath('/admin/media');
    if (slugChanged) {
      // A media URL can appear on any published page, so there is no narrower
      // path to invalidate than the site.
      revalidatePath('/', 'layout');
    }

    return success(
      toMediaDto(updated),
      slugChanged
        ? 'Renamed. The previous URL no longer works — update any link you typed in by hand.'
        : 'Renamed.',
    );
  } catch (error) {
    return toActionError(error);
  }
}

export async function deleteMedia(mediaId: string): Promise<ActionResult> {
  try {
    const user = await authorize('media.delete');
    const media = await prisma.media.findUnique({ where: { id: mediaId } });
    if (!media) return failure('That file no longer exists.');

    // Remove the object first; if that fails we keep the row so nothing is orphaned.
    try {
      await storage().delete(media.storageKey);
    } catch (error) {
      console.error('[media] storage delete failed', error);
    }

    await prisma.media.delete({ where: { id: mediaId } });

    await recordAudit({
      actor: user,
      action: 'deleted',
      entity: 'Media',
      entityId: mediaId,
      summary: `Deleted ${media.filename}`,
    });

    revalidatePath('/admin/media');
    return success(undefined, 'File deleted.');
  } catch (error) {
    return toActionError(error);
  }
}

export async function listMedia(input: {
  query?: string;
  kind?: MediaKind | 'ALL';
  /**
   * 'ALL' shows everything regardless of folder, 'NONE' only the items in no
   * folder (Uncategorised), and an id restricts to that folder.
   */
  folderId?: string | 'ALL' | 'NONE';
  cursor?: string;
  take?: number;
}): Promise<{ items: MediaDto[]; nextCursor: string | null }> {
  await authorize('media.view');

  const take = Math.min(input.take ?? 40, 100);
  const folderFilter =
    !input.folderId || input.folderId === 'ALL'
      ? {}
      : input.folderId === 'NONE'
        ? { folderId: null }
        : { folderId: input.folderId };

  const where = {
    deletedAt: null,
    ...folderFilter,
    ...(input.kind && input.kind !== 'ALL' ? { kind: input.kind } : {}),
    ...(input.query?.trim()
      ? {
          OR: [
            { filename: { contains: input.query.trim(), mode: 'insensitive' as const } },
            { title: { contains: input.query.trim(), mode: 'insensitive' as const } },
            { altText: { contains: input.query.trim(), mode: 'insensitive' as const } },
          ],
        }
      : {}),
  };

  const rows = await prisma.media.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: take + 1,
    ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
    select: MEDIA_DTO_SELECT,
  });

  const hasMore = rows.length > take;
  const items = (hasMore ? rows.slice(0, take) : rows).map(toMediaDto);
  return { items, nextCursor: hasMore ? (items[items.length - 1]?.id ?? null) : null };
}

export async function getMediaById(ids: string[]): Promise<MediaDto[]> {
  await authorize('media.view');
  const unique = Array.from(new Set(ids.filter(Boolean))).slice(0, 50);
  if (unique.length === 0) return [];
  const rows = await prisma.media.findMany({
    where: { id: { in: unique }, deletedAt: null },
    select: MEDIA_DTO_SELECT,
  });
  return rows.map(toMediaDto);
}
