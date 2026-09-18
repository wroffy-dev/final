import 'server-only';
import { prisma } from '@/lib/db/prisma';
import { backupStorage } from './storage';
import { backupConfig, sanitiseError } from './config';
import { recordAudit } from '@/lib/services/audit';
import type { SessionUser } from '@/lib/auth/guards';

/**
 * Retention pruning.
 *
 * Backups are bucketed by the day they were taken, and the newest backup in
 * each bucket is the one that represents that day/week/month. The configured
 * number of buckets is kept, and everything else is removed.
 *
 * The rules that matter most are the ones about what is *never* touched:
 * a running or restoring backup, a safety backup, an imported archive, and the
 * most recent successful backup — even if retention would otherwise expire it.
 * Retention exists to bound storage, not to leave a site with nothing to
 * restore from.
 */

export type RetentionPlan = {
  keep: string[];
  remove: Array<{ id: string; reason: string }>;
};

type Candidate = {
  id: string;
  createdAt: Date;
  origin: string;
  status: string;
};

function bucketKey(date: Date, period: 'daily' | 'weekly' | 'monthly'): string {
  const year = date.getUTCFullYear();
  if (period === 'monthly') return `${year}-${date.getUTCMonth() + 1}`;
  if (period === 'weekly') {
    // ISO-ish week bucket: the Monday of that date's week.
    const monday = new Date(date);
    monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7));
    return `w-${monday.toISOString().slice(0, 10)}`;
  }
  return date.toISOString().slice(0, 10);
}

/**
 * Decides what to delete, without deleting anything.
 *
 * Kept pure and exported so the policy can be tested directly, and so the cron
 * job can log its intent before acting.
 */
export function planRetention(
  candidates: Candidate[],
  limits: { daily: number; weekly: number; monthly: number },
): RetentionPlan {
  const keep = new Set<string>();
  const protectedIds = new Set<string>();

  for (const candidate of candidates) {
    // Never prune anything mid-flight, and never prune a rollback point.
    if (candidate.status !== 'COMPLETED') protectedIds.add(candidate.id);
    if (candidate.origin === 'SAFETY') protectedIds.add(candidate.id);
    // An imported archive was deliberately brought in by an admin; it is not
    // this policy's to expire. Neither is a backup someone took by hand: the
    // limits are configured under "Automatic backups" and apply to those, so
    // pruning a manual one would delete something nobody asked this policy to
    // manage. Manual and imported archives are removed by hand, from History.
    if (candidate.origin === 'IMPORTED') protectedIds.add(candidate.id);
    if (candidate.origin === 'MANUAL') protectedIds.add(candidate.id);
  }

  const completed = candidates
    .filter((candidate) => candidate.status === 'COMPLETED' && !protectedIds.has(candidate.id))
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  // The newest successful backup always survives, whatever the limits say.
  if (completed[0]) keep.add(completed[0].id);

  for (const period of ['daily', 'weekly', 'monthly'] as const) {
    const limit = limits[period];
    if (limit <= 0) continue;

    const seen = new Map<string, string>();
    for (const candidate of completed) {
      const key = bucketKey(candidate.createdAt, period);
      // Sorted newest-first, so the first hit in a bucket is that bucket's
      // representative.
      if (!seen.has(key)) seen.set(key, candidate.id);
      if (seen.size >= limit) break;
    }
    for (const id of seen.values()) keep.add(id);
  }

  const remove = completed
    .filter((candidate) => !keep.has(candidate.id))
    .map((candidate) => ({
      id: candidate.id,
      reason: `Outside the retention window (daily ${limits.daily}, weekly ${limits.weekly}, monthly ${limits.monthly})`,
    }));

  return { keep: [...keep, ...protectedIds], remove };
}

/**
 * Applies the plan: deletes the archives and marks the rows.
 *
 * `excludeIds` protects a backup that is about to be restored from — the
 * restore flow passes the id it is working with, so a retention run triggered
 * in parallel cannot pull the archive out from under it.
 */
export async function applyRetention(options: {
  actor?: SessionUser | null;
  excludeIds?: string[];
} = {}): Promise<{ deleted: number; failed: number; plan: RetentionPlan }> {
  const schedule = await prisma.backupSchedule.findUnique({ where: { id: 'singleton' } });
  const fallback = backupConfig().retention;

  const limits = {
    daily: schedule?.retentionDaily ?? fallback.daily,
    weekly: schedule?.retentionWeekly ?? fallback.weekly,
    monthly: schedule?.retentionMonthly ?? fallback.monthly,
  };

  const candidates = await prisma.backup.findMany({
    select: { id: true, createdAt: true, origin: true, status: true },
    orderBy: { createdAt: 'desc' },
  });

  const plan = planRetention(candidates, limits);
  const excluded = new Set(options.excludeIds ?? []);
  const storageProvider = backupStorage();

  let deleted = 0;
  let failed = 0;

  for (const entry of plan.remove) {
    if (excluded.has(entry.id)) continue;

    const backup = await prisma.backup.findUnique({ where: { id: entry.id } });
    if (!backup) continue;

    try {
      if (backup.storageKey) await storageProvider.delete(backup.storageKey);
      await prisma.backup.delete({ where: { id: entry.id } });
      deleted += 1;

      await recordAudit({
        actor: options.actor ?? null,
        action: 'BACKUP_DELETED',
        entity: 'Backup',
        entityId: entry.id,
        summary: `Retention removed ${backup.fileName ?? entry.id} — ${entry.reason}`,
      });
    } catch (error) {
      failed += 1;
      console.error('[backup] retention delete failed', sanitiseError(error));
    }
  }

  return { deleted, failed, plan };
}
