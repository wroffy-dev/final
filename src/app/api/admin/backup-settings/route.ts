import { apiAuthorize, json } from '@/lib/api/guard';
import { describeBackupConfig, sanitiseError } from '@/lib/backup/config';
import { getSchedule, updateSchedule } from '@/lib/backup/schedule.service';
import { toScheduleDto } from '@/lib/backup/serialize';
import { backupStorage, currentStorageKind } from '@/lib/backup/storage';
import { databaseToolsAvailable } from '@/lib/backup/database-backup.service';
import { recordAudit } from '@/lib/services/audit';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

export async function GET() {
  const guard = await apiAuthorize('backup.view');
  if (!guard.ok) return guard.response;

  const [schedule, tools] = await Promise.all([getSchedule(), databaseToolsAvailable()]);

  return json({
    schedule: toScheduleDto(schedule),
    // Redacted summary only: keys and secrets never reach the browser.
    config: describeBackupConfig(),
    storageKind: currentStorageKind(),
    databaseTools: tools,
  });
}

export async function PUT(request: Request) {
  const guard = await apiAuthorize('backup.settings');
  if (!guard.ok) return guard.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Send the schedule as JSON.' }, 400);
  }

  try {
    const schedule = await updateSchedule(body);

    await recordAudit({
      actor: guard.user,
      action: 'BACKUP_SETTINGS_UPDATED',
      entity: 'BackupSchedule',
      entityId: 'singleton',
      summary: schedule.enabled
        ? `Automatic ${schedule.frequency} ${schedule.backupType} backups enabled`
        : 'Automatic backups disabled',
    });

    return json({ schedule: toScheduleDto(schedule) });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return json({ error: 'Please correct the highlighted fields.' }, 400);
    }
    return json({ error: sanitiseError(error) }, 400);
  }
}

/** "Test storage connection" — a real round-trip, not a config read. */
export async function POST() {
  const guard = await apiAuthorize('backup.settings');
  if (!guard.ok) return guard.response;

  try {
    const result = await backupStorage().healthCheck();
    return json(result, result.ok ? 200 : 400);
  } catch (error) {
    return json({ ok: false, error: sanitiseError(error) }, 400);
  }
}
