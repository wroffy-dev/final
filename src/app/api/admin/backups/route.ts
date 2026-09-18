import { prisma } from '@/lib/db/prisma';
import { apiAuthorize, json } from '@/lib/api/guard';
import { createBackup, getBackupOverview } from '@/lib/backup/backup.service';
import { sanitiseError } from '@/lib/backup/config';
import { BackupBusyError } from '@/lib/backup/lock.service';
import { toBackupDto } from '@/lib/backup/serialize';
import type { BackupType } from '@prisma/client';

export const dynamic = 'force-dynamic';
/** A full backup streams a dump and every media file; the default 30s is not enough. */
export const maxDuration = 300;

const TYPES: BackupType[] = ['FULL', 'DATABASE', 'MEDIA'];

/** History, newest first. */
export async function GET(request: Request) {
  const guard = await apiAuthorize('backup.view');
  if (!guard.ok) return guard.response;

  const url = new URL(request.url);
  const take = Math.min(Math.max(Number(url.searchParams.get('take')) || 25, 1), 100);
  const skip = Math.max(Number(url.searchParams.get('skip')) || 0, 0);

  const [rows, total, overview] = await Promise.all([
    prisma.backup.findMany({
      orderBy: { createdAt: 'desc' },
      take,
      skip,
      include: { createdBy: { select: { name: true } } },
    }),
    prisma.backup.count(),
    getBackupOverview(),
  ]);

  return json({
    backups: rows.map(toBackupDto),
    total,
    overview: { ...overview, latest: undefined, lastSuccessful: undefined },
  });
}

export async function POST(request: Request) {
  const guard = await apiAuthorize('backup.create');
  if (!guard.ok) return guard.response;

  let type: unknown;
  try {
    ({ type } = (await request.json()) as { type?: unknown });
  } catch {
    return json({ error: 'A backup type is required.' }, 400);
  }

  if (typeof type !== 'string' || !TYPES.includes(type as BackupType)) {
    return json({ error: 'Choose FULL, DATABASE or MEDIA.' }, 400);
  }

  try {
    const backup = await createBackup({ type: type as BackupType, actor: guard.user });
    return json({ backup: toBackupDto(backup) }, 201);
  } catch (error) {
    if (error instanceof BackupBusyError) return json({ error: error.message }, 409);
    return json({ error: sanitiseError(error) }, 500);
  }
}
