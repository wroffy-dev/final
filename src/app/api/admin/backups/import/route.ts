import { apiAuthorize, json } from '@/lib/api/guard';
import { backupConfig, sanitiseError } from '@/lib/backup/config';
import { importBackupArchive } from '@/lib/backup/import.service';
import { toBackupDto } from '@/lib/backup/serialize';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * Accepts an uploaded archive and registers it as a restorable backup.
 *
 * Importing never restores: the archive is validated, checksummed and stored,
 * and an admin must then explicitly choose to restore from it.
 */
export async function POST(request: Request) {
  const guard = await apiAuthorize('backup.create');
  if (!guard.ok) return guard.response;

  let file: unknown;
  try {
    const form = await request.formData();
    file = form.get('file');
  } catch {
    return json({ error: 'Upload a .zip backup archive.' }, 400);
  }

  if (!(file instanceof File)) {
    return json({ error: 'Upload a .zip backup archive.' }, 400);
  }

  try {
    const result = await importBackupArchive(file, guard.user);
    if (!result.ok) return json({ error: result.error }, 400);
    return json({ backup: toBackupDto(result.backup) }, 201);
  } catch (error) {
    return json({ error: sanitiseError(error) }, 500);
  }
}

export async function GET() {
  const guard = await apiAuthorize('backup.view');
  if (!guard.ok) return guard.response;
  return json({ maxImportBytes: backupConfig().maxImportBytes });
}
