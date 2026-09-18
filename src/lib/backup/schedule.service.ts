import 'server-only';
import { z } from 'zod';
import { prisma } from '@/lib/db/prisma';
import type { BackupSchedule, BackupType } from '@prisma/client';

/**
 * Scheduling for automatic backups.
 *
 * The schedule is stored in the admin's chosen timezone (Asia/Kolkata by
 * default) and `nextRunAt` is computed as a real UTC instant, so the cron
 * endpoint only has to ask "is it due yet?" rather than reason about zones on
 * every tick. Recomputing after each run also means a change to the schedule
 * takes effect immediately.
 */

export const DEFAULT_SCHEDULE = {
  enabled: false,
  frequency: 'daily' as const,
  hour: 3,
  minute: 0,
  dayOfWeek: 0,
  dayOfMonth: 1,
  backupType: 'FULL' as BackupType,
  timezone: 'Asia/Kolkata',
  retentionDaily: 7,
  retentionWeekly: 4,
  retentionMonthly: 3,
};

export async function getSchedule(): Promise<BackupSchedule> {
  return prisma.backupSchedule.upsert({
    where: { id: 'singleton' },
    update: {},
    create: { id: 'singleton' },
  });
}

/**
 * The UTC offset of a timezone at a given instant, in minutes.
 *
 * Derived from Intl rather than a hardcoded table so daylight saving is
 * handled correctly for zones that observe it — Asia/Kolkata does not, but the
 * field is configurable and Europe/London very much does.
 */
function offsetMinutes(timeZone: string, at: Date): number {
  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hour12: false,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    const parts = Object.fromEntries(
      formatter.formatToParts(at).map((part) => [part.type, part.value]),
    );
    const asUtc = Date.UTC(
      Number(parts.year),
      Number(parts.month) - 1,
      Number(parts.day),
      Number(parts.hour),
      Number(parts.minute),
      Number(parts.second),
    );
    return (asUtc - at.getTime()) / 60_000;
  } catch {
    // An invalid zone must not stop backups; fall back to UTC.
    return 0;
  }
}

/**
 * The next moment the schedule should fire, as a UTC instant.
 *
 * Exported for testing: the timezone arithmetic is the part most likely to be
 * wrong, so it is verified directly rather than only through the cron route.
 */
export function computeNextRun(
  schedule: Pick<
    BackupSchedule,
    'frequency' | 'hour' | 'minute' | 'dayOfWeek' | 'dayOfMonth' | 'timezone'
  >,
  from = new Date(),
): Date {
  const offset = offsetMinutes(schedule.timezone, from);

  // "Now" expressed in the admin's local wall clock.
  const local = new Date(from.getTime() + offset * 60_000);

  const candidate = new Date(local);
  candidate.setUTCSeconds(0, 0);
  candidate.setUTCHours(schedule.hour, schedule.minute, 0, 0);

  if (schedule.frequency === 'weekly') {
    const target = ((schedule.dayOfWeek % 7) + 7) % 7;
    let delta = (target - candidate.getUTCDay() + 7) % 7;
    if (delta === 0 && candidate <= local) delta = 7;
    candidate.setUTCDate(candidate.getUTCDate() + delta);
  } else if (schedule.frequency === 'monthly') {
    const day = Math.min(Math.max(schedule.dayOfMonth, 1), 28); // 28 is safe in every month
    candidate.setUTCDate(day);
    if (candidate <= local) candidate.setUTCMonth(candidate.getUTCMonth() + 1);
  } else if (candidate <= local) {
    candidate.setUTCDate(candidate.getUTCDate() + 1);
  }

  // Back to a real instant.
  return new Date(candidate.getTime() - offset * 60_000);
}

export async function refreshNextRun(lastRunAt?: Date): Promise<BackupSchedule> {
  const schedule = await getSchedule();
  return prisma.backupSchedule.update({
    where: { id: 'singleton' },
    data: {
      ...(lastRunAt ? { lastRunAt } : {}),
      nextRunAt: schedule.enabled ? computeNextRun(schedule, lastRunAt ?? new Date()) : null,
    },
  });
}

/** Whether a scheduled backup is due right now. */
export function isDue(schedule: BackupSchedule, now = new Date()): boolean {
  if (!schedule.enabled) return false;
  if (!schedule.nextRunAt) return true; // never computed — run once, then schedule
  return schedule.nextRunAt.getTime() <= now.getTime();
}

/**
 * The fields an admin may change, with the bounds the UI also enforces.
 *
 * Validated here rather than only in the route so the cron path and any future
 * caller get the same guarantees — an out-of-range hour would otherwise
 * silently produce a `nextRunAt` that never arrives.
 */
export const scheduleInputSchema = z.object({
  enabled: z.boolean(),
  frequency: z.enum(['daily', 'weekly', 'monthly']),
  hour: z.number().int().min(0).max(23),
  minute: z.number().int().min(0).max(59),
  dayOfWeek: z.number().int().min(0).max(6),
  // Capped at 28 so a monthly schedule fires in February too.
  dayOfMonth: z.number().int().min(1).max(28),
  backupType: z.enum(['FULL', 'DATABASE', 'MEDIA']),
  timezone: z.string().min(1).max(64),
  retentionDaily: z.number().int().min(1).max(365),
  retentionWeekly: z.number().int().min(1).max(104),
  retentionMonthly: z.number().int().min(1).max(60),
});

export type ScheduleInput = z.infer<typeof scheduleInputSchema>;

export async function updateSchedule(input: unknown): Promise<BackupSchedule> {
  const parsed = scheduleInputSchema.parse(input);

  // An unknown timezone would make every later `computeNextRun` throw.
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: parsed.timezone });
  } catch {
    throw new Error('That is not a recognised timezone.');
  }

  const nextRunAt = parsed.enabled ? computeNextRun(parsed) : null;

  return prisma.backupSchedule.upsert({
    where: { id: 'singleton' },
    update: { ...parsed, nextRunAt },
    create: { id: 'singleton', ...parsed, nextRunAt },
  });
}
