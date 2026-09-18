import { apiAuthorize, json } from '@/lib/api/guard';
import { sanitiseError } from '@/lib/backup/config';
import { restoreFromBackup } from '@/lib/backup/database-restore.service';
import { BackupBusyError } from '@/lib/backup/lock.service';

export const dynamic = 'force-dynamic';
/** A restore takes a safety backup first, then replaces the database and media. */
export const maxDuration = 600;

/**
 * Restores the site from a backup.
 *
 * Deliberately requires the caller to echo the word RESTORE in the body as
 * well as holding `backup.restore`: this replaces the live database, and a
 * mis-routed fetch should not be able to trigger it.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await apiAuthorize('backup.restore');
  if (!guard.ok) return guard.response;

  let confirm: unknown;
  try {
    ({ confirm } = (await request.json()) as { confirm?: unknown });
  } catch {
    confirm = undefined;
  }

  if (confirm !== 'RESTORE') {
    return json({ error: 'Type RESTORE to confirm this restore.' }, 400);
  }

  const { id } = await params;

  try {
    const result = await restoreFromBackup(id, guard.user);
    return json({ ok: true, ...result });
  } catch (error) {
    if (error instanceof BackupBusyError) return json({ error: error.message }, 409);
    return json({ error: sanitiseError(error) }, 500);
  }
}
