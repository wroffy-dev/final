import 'server-only';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import { LocalStorage } from '@/lib/storage/local';

/**
 * Serves a file that lives on this machine's disk.
 *
 * Next's standalone server reads `public/` once, when it starts. A file written
 * there afterwards is invisible to it — which is every upload, since they are
 * written by the running server. Reading from disk per request is what a CMS
 * needs and what the static handler cannot do.
 *
 * It answers under two prefixes. `/media` is where new uploads are published;
 * `/uploads` is where they used to be, and rows written before the move still
 * carry that URL, so both are routed to this one handler rather than one of
 * them quietly 404ing a library's worth of images.
 *
 * S3 and R2 are unaffected either way: those URLs are absolute and point at the
 * bucket, so they never arrive here. Files that predate a switch to object
 * storage still serve, because this only ever asks the disk.
 */

/** Only what the uploader accepts. Anything else is downloaded, not rendered. */
const CONTENT_TYPES: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.pdf': 'application/pdf',
};

function notFound(): Response {
  return new Response('Not found', {
    status: 404,
    headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' },
  });
}

export async function serveStoredFile(segments: string[] | undefined): Promise<Response> {
  const key = (segments ?? []).join('/');
  if (!key) return notFound();

  /*
   * One guard, in one place.
   *
   * `locate` runs the key through the same allowlist the writer uses and then
   * resolves it inside a directory this application owns, so `..`, an absolute
   * path, a backslash, a null byte, a dotfile and anything left percent-encoded
   * are all refused here rather than reaching the filesystem. A key that passes
   * cannot name a file outside the upload root.
   */
  const target = await new LocalStorage().locate(key);
  if (!target) return notFound();

  let info;
  try {
    info = await stat(target);
  } catch {
    return notFound();
  }
  if (!info.isFile()) return notFound();

  const extension = path.extname(target).toLowerCase();
  const contentType = CONTENT_TYPES[extension] ?? 'application/octet-stream';

  const stream = Readable.toWeb(createReadStream(target)) as ReadableStream<Uint8Array>;

  /*
   * Only the headers that depend on the file itself.
   *
   * nosniff, the sandboxing CSP — which is what makes serving an SVG safe —
   * `Content-Disposition: inline` and the immutable cache all come from the
   * `/media/:path*` and `/uploads/:path*` rules in next.config.mjs, and a
   * config header wins over one set here, so setting them again would only
   * create two sources of truth that can disagree.
   */
  return new Response(stream, {
    headers: {
      'content-type': contentType,
      'content-length': String(info.size),
      'last-modified': info.mtime.toUTCString(),
    },
  });
}
