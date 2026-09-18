import type { MediaKind } from '@prisma/client';

/**
 * The shape the admin works with.
 *
 * Kept out of the Server Action module on purpose: a file marked `use server`
 * may only export async functions, so the select, the mapper and the slug
 * helper — none of which are actions — live here and are imported by both the
 * actions and the pages that render them.
 */
export type MediaDto = {
  id: string;
  url: string;
  filename: string;
  mimeType: string;
  kind: MediaKind;
  size: number;
  width: number | null;
  height: number | null;
  altText: string | null;
  title: string | null;
  /** The stem of the stored file, without its extension. Editable. */
  slug: string;
  /** Null means the item is not in any folder (Uncategorised). */
  folderId: string | null;
  createdAt: string;
};

/**
 * The editable part of a storage key: its basename, without the extension.
 *
 * Written with string operations rather than `node:path` so this module stays
 * importable from anywhere — it carries the type the admin UI is built on, and
 * a node built-in in that graph breaks the client bundle.
 */
export function slugOfKey(storageKey: string): string {
  const base = storageKey.slice(storageKey.lastIndexOf('/') + 1);
  const dot = base.lastIndexOf('.');
  return dot > 0 ? base.slice(0, dot) : base;
}

/** The columns every MediaDto is built from. */
export const MEDIA_DTO_SELECT = {
  id: true,
  url: true,
  filename: true,
  storageKey: true,
  mimeType: true,
  kind: true,
  size: true,
  width: true,
  height: true,
  altText: true,
  title: true,
  folderId: true,
  createdAt: true,
} as const;

export type MediaDtoRow = {
  id: string;
  url: string;
  filename: string;
  storageKey: string;
  mimeType: string;
  kind: MediaKind;
  size: number;
  width: number | null;
  height: number | null;
  altText: string | null;
  title: string | null;
  folderId: string | null;
  createdAt: Date;
};

export function toMediaDto(row: MediaDtoRow): MediaDto {
  const { storageKey, ...rest } = row;
  return { ...rest, slug: slugOfKey(storageKey), createdAt: row.createdAt.toISOString() };
}
