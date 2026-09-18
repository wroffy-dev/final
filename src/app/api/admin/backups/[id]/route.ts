import { prisma } from '@/lib/db/prisma';
import { apiAuthorize, json } from '@/lib/api/guard';
import { deleteBackup } from '@/lib/backup/backup.service';
import { sanitiseError } from '@/lib/backup/config';
import { toBackupDto, toRestoreDto } from '@/lib/backup/serialize';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  const guard = await apiAuthorize('backup.view');
  if (!guard.ok) return guard.response;

  const { id } = await params;
  const backup = await prisma.backup.findUnique({
    where: { id },
    include: {
      createdBy: { select: { name: true } },
      restores: { orderBy: { startedAt: 'desc' }, take: 10 },
    },
  });

  if (!backup) return json({ error: 'That backup no longer exists.' }, 404);

  const { restores, ...row } = backup;
  return json({ backup: toBackupDto(row), restores: restores.map(toRestoreDto) });
}

export async function DELETE(_request: Request, { params }: Params) {
  const guard = await apiAuthorize('backup.delete');
  if (!guard.ok) return guard.response;

  const { id } = await params;
  try {
    await deleteBackup(id, guard.user);
    return json({ ok: true });
  } catch (error) {
    return json({ error: sanitiseError(error) }, 400);
  }
}
