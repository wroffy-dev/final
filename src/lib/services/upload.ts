import 'server-only';
import path from 'node:path';
import { randomToken } from '@/lib/utils/crypto';
import {
  ALLOWED_EXTENSIONS,
  ACCEPT_ATTRIBUTE,
  DEFAULT_MAX_UPLOAD_KB,
  UNSUPPORTED_TYPE_MESSAGE,
  formatUploadLimit,
  tooLargeMessage,
} from '@/lib/media/constants';

// Re-exported so existing server-side imports keep working from one place.
export { ALLOWED_EXTENSIONS, ACCEPT_ATTRIBUTE, UNSUPPORTED_TYPE_MESSAGE };

/**
 * The only file types this installation accepts.
 *
 * Deliberately narrow: AVIF, MP4, WEBM, DOC, DOCX and CSV were removed because
 * nothing on the site renders them and each one widens the parser surface a
 * hostile upload can reach. Adding a type here means also adding a signature
 * below — a declared MIME type is never trusted on its own.
 */
export const ALLOWED_MIME: Record<string, { ext: string; kind: 'IMAGE' | 'DOCUMENT' }> = {
  'image/jpeg': { ext: 'jpg', kind: 'IMAGE' },
  'image/png': { ext: 'png', kind: 'IMAGE' },
  'image/webp': { ext: 'webp', kind: 'IMAGE' },
  'image/gif': { ext: 'gif', kind: 'IMAGE' },
  'image/svg+xml': { ext: 'svg', kind: 'IMAGE' },
  'application/pdf': { ext: 'pdf', kind: 'DOCUMENT' },
};

/** Magic-byte signatures. A declared MIME type is never trusted on its own. */
const SIGNATURES: Array<{ mime: string; test: (buf: Buffer) => boolean }> = [
  { mime: 'image/jpeg', test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  {
    mime: 'image/png',
    test: (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47,
  },
  { mime: 'image/gif', test: (b) => b.subarray(0, 3).toString('ascii') === 'GIF' },
  {
    mime: 'image/webp',
    test: (b) =>
      b.subarray(0, 4).toString('ascii') === 'RIFF' &&
      b.subarray(8, 12).toString('ascii') === 'WEBP',
  },
  { mime: 'application/pdf', test: (b) => b.subarray(0, 4).toString('ascii') === '%PDF' },
];

/**
 * Upload ceiling in bytes.
 *
 * `MAX_UPLOAD_SIZE_MB` is the name to configure; `MAX_UPLOAD_KB` is read after
 * it so a deployment that already set one keeps its limit. A missing,
 * non-numeric or non-positive value in either falls back to the default — a
 * misconfigured environment must never silently remove the limit, which is
 * exactly what `Number('') === 0` and `Number('abc') === NaN` would do if the
 * result were used unchecked.
 */
export function maxUploadBytes(): number {
  const mb = Number(process.env.MAX_UPLOAD_SIZE_MB);
  if (Number.isFinite(mb) && mb > 0) return Math.floor(mb * 1024 * 1024);

  const kb = Number(process.env.MAX_UPLOAD_KB);
  if (Number.isFinite(kb) && kb > 0) return Math.floor(kb * 1024);

  return DEFAULT_MAX_UPLOAD_KB * 1024;
}

/** "10 MB" — the configured ceiling, for hint text next to an upload control. */
export function maxUploadLabel(): string {
  return formatUploadLimit(maxUploadBytes());
}

/** The rejection message, carrying the limit actually in force. */
export function tooLargeError(): string {
  return tooLargeMessage(maxUploadBytes());
}

export type UploadValidation =
  | { ok: true; mimeType: string; kind: 'IMAGE' | 'DOCUMENT'; extension: string }
  | { ok: false; error: string };

export function validateUpload(
  declaredMime: string,
  buffer: Buffer,
  size: number,
): UploadValidation {
  if (size > maxUploadBytes()) return { ok: false, error: tooLargeError() };
  if (size === 0) return { ok: false, error: 'That file is empty.' };

  const allowed = ALLOWED_MIME[declaredMime];
  // The declared type is not echoed back: it is attacker-controlled, and the
  // admin only needs to know which formats are accepted.
  if (!allowed) return { ok: false, error: UNSUPPORTED_TYPE_MESSAGE };

  // SVG is XML, so it can carry script, external references and entity
  // expansions. It has no magic byte to check, which makes the content scan the
  // only real defence — so it reads the whole file rather than a 4 KB window an
  // attacker could simply pad past.
  if (declaredMime === 'image/svg+xml') {
    const problem = inspectSvg(buffer);
    if (problem) return { ok: false, error: problem };
    return { ok: true, mimeType: declaredMime, kind: allowed.kind, extension: allowed.ext };
  }

  // Text-ish formats have no reliable signature; everything else must match.
  const needsSignature = SIGNATURES.some((s) => s.mime === declaredMime);
  if (needsSignature) {
    const matched = SIGNATURES.find((s) => s.test(buffer));
    if (!matched || (matched.mime !== declaredMime && !isCompatible(matched.mime, declaredMime))) {
      return { ok: false, error: 'That file’s contents do not match its type.' };
    }
  }

  return { ok: true, mimeType: declaredMime, kind: allowed.kind, extension: allowed.ext };
}

/**
 * Rejects an SVG that could execute or fetch something when rendered.
 *
 * Returns the visitor-facing reason, or null when the file looks inert. The
 * checks run over the entire decoded file, and over a copy with whitespace and
 * XML/HTML comments stripped, so `<scr<!-- -->ipt>` and `java\nscript:` cannot
 * slip past a naive substring match. This complements — never replaces —
 * escaping at render time.
 */
function inspectSvg(buffer: Buffer): string | null {
  const raw = buffer.toString('utf8');

  // Must actually be an SVG, not something else wearing the MIME type.
  if (!/<svg[\s>]/i.test(raw)) {
    return 'That file does not look like an SVG.';
  }

  // Comments and numeric entities are the usual way a keyword gets broken up
  // (`<scr<!-- -->ipt>`), so both are removed before anything is matched.
  const base = raw
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/&#x?[0-9a-f]+;?/gi, '')
    .toLowerCase();

  // Two views of the same file, because the two attack shapes need opposite
  // treatment: collapsing whitespace keeps attribute boundaries intact so an
  // event handler is still recognisable, while removing it entirely defeats a
  // scheme split over a newline ("java\nscript:").
  const collapsed = base.replace(/\s+/g, ' ');
  const stripped = base.replace(/\s+/g, '');

  const checks: Array<[RegExp, string, string]> = [
    [/<script/, stripped, 'script'],
    [/<foreignobject/, stripped, 'embedded HTML'],
    [/<iframe|<embed|<object/, stripped, 'an embedded frame'],
    [/<use[^>]*href=["']?https?:/, stripped, 'a remote reference'],
    [/<!entity|<!doctype[^>]*entity/, stripped, 'an XML entity'],
    [/javascript:|data:text\/html/, stripped, 'a script URL'],
    // Attribute boundary is a space, quote or the tag name itself.
    [/[\s"'][a-z-]*on[a-z]+ ?=/, collapsed, 'an event handler'],
    [/<set|<animate[^>]*attributename=["']? ?on/, collapsed, 'a scripted animation'],
  ];

  for (const [pattern, subject, what] of checks) {
    if (pattern.test(subject)) {
      return `That SVG contains ${what} and cannot be uploaded.`;
    }
  }

  return null;
}

/**
 * No two accepted formats share a signature any more — the ISO-BMFF pair
 * (AVIF/MP4) that needed this leniency is gone — so a detected type must equal
 * the declared one exactly.
 */
function isCompatible(detected: string, declared: string): boolean {
  return detected === declared;
}

/**
 * The URL-safe stem of a filename.
 *
 * Lowercase letters, digits and single hyphens — nothing else survives, which
 * is what makes a name typed by an administrator safe to join to a directory:
 * a path separator, a leading dot, a percent sign or a `..` cannot come out of
 * this function at all.
 */
export function mediaSlug(value: string): string {
  return path
    .basename(value, path.extname(value))
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

/** Namespaced, unguessable storage key. Never derived from user input alone. */
export function buildStorageKey(filename: string, extension: string): string {
  const base = mediaSlug(filename) || 'file';
  const now = new Date();
  const folder = `${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, '0')}`;
  return `${folder}/${base}-${randomToken(6)}.${extension}`;
}

/** Reads intrinsic dimensions from PNG/JPEG/GIF/WebP headers without a decoder. */
export function readImageDimensions(
  buffer: Buffer,
  mime: string,
): { width: number; height: number } | null {
  try {
    if (mime === 'image/png' && buffer.length > 24) {
      return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
    }
    if (mime === 'image/gif' && buffer.length > 10) {
      return { width: buffer.readUInt16LE(6), height: buffer.readUInt16LE(8) };
    }
    if (mime === 'image/webp' && buffer.length > 30) {
      const format = buffer.subarray(12, 16).toString('ascii');
      if (format === 'VP8 ') {
        return {
          width: buffer.readUInt16LE(26) & 0x3fff,
          height: buffer.readUInt16LE(28) & 0x3fff,
        };
      }
      if (format === 'VP8L') {
        const bits = buffer.readUInt32LE(21);
        return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
      }
      if (format === 'VP8X') {
        const width = 1 + (buffer.readUIntLE(24, 3) & 0xffffff);
        const height = 1 + (buffer.readUIntLE(27, 3) & 0xffffff);
        return { width, height };
      }
    }
    if (mime === 'image/jpeg') {
      let offset = 2;
      while (offset < buffer.length - 9) {
        if (buffer[offset] !== 0xff) {
          offset += 1;
          continue;
        }
        const marker = buffer[offset + 1]!;
        // SOF0-SOF15, excluding DHT/JPG/DAC
        if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
          return {
            height: buffer.readUInt16BE(offset + 5),
            width: buffer.readUInt16BE(offset + 7),
          };
        }
        offset += 2 + buffer.readUInt16BE(offset + 2);
      }
    }
  } catch {
    return null;
  }
  return null;
}
