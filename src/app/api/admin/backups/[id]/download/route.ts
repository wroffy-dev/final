import { NextResponse } from 'next/server';
import { Readable } from 'node:stream';
import { prisma } from '@/lib/db/prisma';
import { apiAuthorize, json } from '@/lib/api/guard';
import { sanitiseError } from '@/lib/backup/config';
import { backupStorage } from '@/lib/backup/storage';
import { recordAudit } from '@/lib/services/audit';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/** Ten minutes is long enough to start a large download, short enough to expire. */
const SIGNED_URL_TTL_SECONDS = 600;

/**
 * Streams an archive to an authorised admin.
 *
 * The archive is never served from a public path: local storage streams
 * through this handler, and S3-compatible storage redirects to a short-lived
 * signed URL so the bucket itself can stay private.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await apiAuthorize('backup.download');
  if (!guard.ok) return guard.response;

  const { id } = await params;
  const backup = await prisma.backup.findUnique({ where: { id } });

  if (!backup) return json({ error: 'That backup no longer exists.' }, 404);
  if (backup.status !== 'COMPLETED' || !backup.storageKey) {
    return json({ error: 'Only a completed backup can be downloaded.' }, 400);
  }

  const fileName = backup.fileName ?? `${backup.id}.zip`;

  try {
    const storage = backupStorage();

    await recordAudit({
      actor: guard.user,
      action: 'BACKUP_DOWNLOADED',
      entity: 'Backup',
      entityId: backup.id,
      summary: `Downloaded ${fileName}`,
    });

    const signed = await storage.getSignedDownloadUrl(backup.storageKey, SIGNED_URL_TTL_SECONDS);
    if (signed) return NextResponse.redirect(signed, 302);

    const body = await storage.download(backup.storageKey);

    return new NextResponse(toWebStream(body), {
      headers: {
        'content-type': 'application/zip',
        'content-disposition': `attachment; filename="${fileName.replace(/"/g, '')}"`,
        ...(backup.sizeBytes ? { 'content-length': String(backup.sizeBytes) } : {}),
        'cache-control': 'no-store',
      },
    });
  } catch (error) {
    return json({ error: sanitiseError(error) }, 500);
  }
}

/** Node streams are not directly assignable to a Response body in every runtime. */
function toWebStream(stream: Readable): ReadableStream<Uint8Array> {
  return Readable.toWeb(stream) as unknown as ReadableStream<Uint8Array>;
}
