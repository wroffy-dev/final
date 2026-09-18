'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { PlugZap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardFooter, CardHeader } from '@/components/ui/card';
import { Field, Input, Select, Switch } from '@/components/ui/field';
import { useToast } from '@/components/ui/toast';
import type { BackupScheduleDto } from '@/lib/backup/serialize';

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/**
 * Schedule and retention.
 *
 * Retention is expressed as "how many to keep" per tier rather than "delete
 * after N days", because the question an admin actually asks is how far back
 * they can go — and a count can never delete everything.
 */
export function BackupScheduleForm({
  schedule,
  timezone,
  canEdit,
}: {
  schedule: BackupScheduleDto;
  timezone: string;
  canEdit: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();

  const [form, setForm] = React.useState({
    enabled: schedule.enabled,
    frequency: schedule.frequency,
    hour: schedule.hour,
    minute: schedule.minute,
    dayOfWeek: schedule.dayOfWeek,
    dayOfMonth: schedule.dayOfMonth,
    backupType: schedule.backupType,
    timezone: schedule.timezone || timezone,
    retentionDaily: schedule.retentionDaily,
    retentionWeekly: schedule.retentionWeekly,
    retentionMonthly: schedule.retentionMonthly,
  });
  const [saving, setSaving] = React.useState(false);
  const [testing, setTesting] = React.useState(false);

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function save() {
    setSaving(true);
    try {
      const response = await fetch('/api/admin/backup-settings', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(form),
      });
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        toast(body.error ?? 'Those settings could not be saved.', 'error');
        return;
      }
      toast('Backup settings saved.');
      router.refresh();
    } catch {
      toast('The server could not be reached.', 'error');
    } finally {
      setSaving(false);
    }
  }

  async function testConnection() {
    setTesting(true);
    try {
      const response = await fetch('/api/admin/backup-settings', { method: 'POST' });
      const body = (await response.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (response.ok && body.ok) toast('Storage is reachable and writable.');
      else toast(body.error ?? 'Storage could not be reached.', 'error');
    } catch {
      toast('The server could not be reached.', 'error');
    } finally {
      setTesting(false);
    }
  }

  return (
    <Card>
      <CardHeader
        title="Automatic backups"
        description="A scheduled backup runs only when the cron endpoint is called. See the deployment notes if nothing is running."
        actions={
          <Button variant="outline" size="sm" onClick={testConnection} disabled={testing}>
            <PlugZap className="h-4 w-4" aria-hidden="true" />
            {testing ? 'Testing…' : 'Test storage'}
          </Button>
        }
      />

      <div className="space-y-5 p-4 sm:p-5">
        <Switch
          checked={form.enabled}
          onChange={(value) => set('enabled', value)}
          label="Run backups automatically"
          hint="When off, backups only happen when someone presses a button."
          disabled={!canEdit}
        />

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="What to back up">
            <Select
              value={form.backupType}
              onChange={(event) =>
                set('backupType', event.target.value as typeof form.backupType)
              }
              disabled={!canEdit}
            >
              <option value="FULL">Database + media</option>
              <option value="DATABASE">Database only</option>
              <option value="MEDIA">Media only</option>
            </Select>
          </Field>

          <Field label="How often">
            <Select
              value={form.frequency}
              onChange={(event) => set('frequency', event.target.value)}
              disabled={!canEdit}
            >
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
            </Select>
          </Field>

          {form.frequency === 'weekly' ? (
            <Field label="Day of week">
              <Select
                value={String(form.dayOfWeek)}
                onChange={(event) => set('dayOfWeek', Number(event.target.value))}
                disabled={!canEdit}
              >
                {DAYS.map((day, index) => (
                  <option key={day} value={index}>
                    {day}
                  </option>
                ))}
              </Select>
            </Field>
          ) : null}

          {form.frequency === 'monthly' ? (
            <Field label="Day of month" hint="Capped at 28 so it fires in February too.">
              <Input
                type="number"
                min={1}
                max={28}
                value={form.dayOfMonth}
                onChange={(event) => set('dayOfMonth', Number(event.target.value))}
                disabled={!canEdit}
              />
            </Field>
          ) : null}

          <Field label="Time" hint={`In ${form.timezone}.`}>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min={0}
                max={23}
                aria-label="Hour"
                value={form.hour}
                onChange={(event) => set('hour', Number(event.target.value))}
                disabled={!canEdit}
              />
              <span className="text-muted">:</span>
              <Input
                type="number"
                min={0}
                max={59}
                aria-label="Minute"
                value={form.minute}
                onChange={(event) => set('minute', Number(event.target.value))}
                disabled={!canEdit}
              />
            </div>
          </Field>

          <Field label="Timezone">
            <Input
              value={form.timezone}
              onChange={(event) => set('timezone', event.target.value)}
              placeholder="Asia/Kolkata"
              disabled={!canEdit}
            />
          </Field>
        </div>

        <div className="border-t border-hairline pt-5">
          <h3 className="text-sm font-semibold text-content">How many to keep</h3>
          <p className="mt-0.5 text-xs text-muted">
            Older automatic backups are pruned after each scheduled run. Manual backups, imported
            archives and safety backups are never pruned.
          </p>
          <div className="mt-3 grid gap-4 sm:grid-cols-3">
            <Field label="Daily">
              <Input
                type="number"
                min={1}
                max={365}
                value={form.retentionDaily}
                onChange={(event) => set('retentionDaily', Number(event.target.value))}
                disabled={!canEdit}
              />
            </Field>
            <Field label="Weekly">
              <Input
                type="number"
                min={1}
                max={104}
                value={form.retentionWeekly}
                onChange={(event) => set('retentionWeekly', Number(event.target.value))}
                disabled={!canEdit}
              />
            </Field>
            <Field label="Monthly">
              <Input
                type="number"
                min={1}
                max={60}
                value={form.retentionMonthly}
                onChange={(event) => set('retentionMonthly', Number(event.target.value))}
                disabled={!canEdit}
              />
            </Field>
          </div>
        </div>
      </div>

      {canEdit ? (
        <CardFooter>
          <Button onClick={save} disabled={saving}>
            {saving ? 'Saving…' : 'Save settings'}
          </Button>
        </CardFooter>
      ) : null}
    </Card>
  );
}
