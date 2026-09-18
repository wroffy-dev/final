import { describe, it, expect } from 'vitest';
import {
  resolveRange,
  previousRange,
  rangeLengthInDays,
  chooseGranularity,
  formatRangeLabel,
  percentChange,
  toDayString,
  parseDayString,
  startOfDay,
  endOfDay,
} from '@/lib/admin/date-range';

// A fixed "now" so the presets are deterministic: Thursday 10 Sep 2026, 14:30 local.
const NOW = new Date(2026, 8, 10, 14, 30, 0);

describe('date range presets', () => {
  it('expands each preset to the right calendar days', () => {
    const cases: Array<[string, string, string]> = [
      ['today', '2026-09-10', '2026-09-10'],
      ['yesterday', '2026-09-09', '2026-09-09'],
      ['last7', '2026-09-04', '2026-09-10'],
      ['last30', '2026-08-12', '2026-09-10'],
      ['thisMonth', '2026-09-01', '2026-09-10'],
      ['lastMonth', '2026-08-01', '2026-08-31'],
      ['thisQuarter', '2026-07-01', '2026-09-10'],
      ['thisYear', '2026-01-01', '2026-09-10'],
    ];
    for (const [range, from, to] of cases) {
      expect(resolveRange({ range }, NOW)).toEqual({ preset: range, from, to });
    }
  });

  it('falls back to last 30 days for an unknown or missing preset', () => {
    expect(resolveRange({}, NOW).preset).toBe('last30');
    expect(resolveRange({ range: 'nonsense' }, NOW).preset).toBe('last30');
  });

  it('lets an explicit range win and reports it as custom', () => {
    expect(resolveRange({ range: 'today', from: '2026-01-01', to: '2026-01-31' }, NOW)).toEqual({
      preset: 'custom',
      from: '2026-01-01',
      to: '2026-01-31',
    });
  });

  it('repairs a half-open or backwards custom range instead of dropping it', () => {
    expect(resolveRange({ from: '2026-03-05' }, NOW)).toEqual({
      preset: 'custom',
      from: '2026-03-05',
      to: '2026-03-05',
    });
    expect(resolveRange({ from: '2026-03-20', to: '2026-03-01' }, NOW)).toEqual({
      preset: 'custom',
      from: '2026-03-01',
      to: '2026-03-20',
    });
  });

  it('ignores malformed dates rather than producing an invalid range', () => {
    expect(resolveRange({ from: 'yesterday' }, NOW).preset).toBe('last30');
    expect(resolveRange({ from: '2026-02-31' }, NOW).preset).toBe('last30');
    expect(resolveRange({ from: '20260101' }, NOW).preset).toBe('last30');
    expect(parseDayString('2026-13-01')).toBeNull();
    expect(parseDayString('')).toBeNull();
  });
});

describe('timezone-safe day boundaries', () => {
  it('reads the local calendar day, not the UTC one', () => {
    // 23:30 local on the 10th. toISOString() would report the 11th in any
    // timezone east of UTC, which is exactly the bug this avoids.
    const lateEvening = new Date(2026, 8, 10, 23, 30, 0);
    expect(toDayString(lateEvening)).toBe('2026-09-10');

    const earlyMorning = new Date(2026, 8, 10, 0, 15, 0);
    expect(toDayString(earlyMorning)).toBe('2026-09-10');
  });

  it('covers a whole day from first to last millisecond', () => {
    const start = startOfDay('2026-09-10');
    const end = endOfDay('2026-09-10');

    expect(start.getHours()).toBe(0);
    expect(start.getMinutes()).toBe(0);
    expect(start.getMilliseconds()).toBe(0);
    expect(end.getHours()).toBe(23);
    expect(end.getMinutes()).toBe(59);
    expect(end.getMilliseconds()).toBe(999);

    // A lead created at either edge falls inside the range.
    expect(new Date(2026, 8, 10, 0, 0, 0, 0) >= start).toBe(true);
    expect(new Date(2026, 8, 10, 23, 59, 59, 999) <= end).toBe(true);
    // One that arrived the next second does not.
    expect(new Date(2026, 8, 11, 0, 0, 0, 0) <= end).toBe(false);
  });
});

describe('previous period comparison', () => {
  it('compares against an equally long window immediately before', () => {
    expect(previousRange({ from: '2026-09-04', to: '2026-09-10' })).toEqual({
      from: '2026-08-28',
      to: '2026-09-03',
    });
    // A single day compares against the day before.
    expect(previousRange({ from: '2026-09-10', to: '2026-09-10' })).toEqual({
      from: '2026-09-09',
      to: '2026-09-09',
    });
  });

  it('never overlaps the current range', () => {
    const current = { from: '2026-09-01', to: '2026-09-30' };
    const previous = previousRange(current);
    expect(previous.to < current.from).toBe(true);
    expect(rangeLengthInDays(previous)).toBe(rangeLengthInDays(current));
  });

  it('counts inclusive days', () => {
    expect(rangeLengthInDays({ from: '2026-09-10', to: '2026-09-10' })).toBe(1);
    expect(rangeLengthInDays({ from: '2026-09-04', to: '2026-09-10' })).toBe(7);
    expect(rangeLengthInDays({ from: '2026-01-01', to: '2026-12-31' })).toBe(365);
  });

  it('spans a month boundary and a leap day correctly', () => {
    expect(rangeLengthInDays({ from: '2024-02-01', to: '2024-03-01' })).toBe(30);
    expect(previousRange({ from: '2026-03-01', to: '2026-03-31' })).toEqual({
      from: '2026-01-29',
      to: '2026-02-28',
    });
  });
});

describe('chart granularity', () => {
  it('picks a bucket size that keeps the chart readable', () => {
    expect(chooseGranularity({ from: '2026-09-10', to: '2026-09-10' })).toBe('hour');
    expect(chooseGranularity({ from: '2026-09-04', to: '2026-09-10' })).toBe('day');
    expect(chooseGranularity({ from: '2026-08-12', to: '2026-09-10' })).toBe('day');
    expect(chooseGranularity({ from: '2026-01-01', to: '2026-09-10' })).toBe('week');
    expect(chooseGranularity({ from: '2024-01-01', to: '2026-09-10' })).toBe('month');
  });
});

describe('presentation', () => {
  it('reads the range back the way the brief asks', () => {
    expect(formatRangeLabel({ from: '2026-09-01', to: '2026-09-10' })).toBe(
      '01 Sep 2026 – 10 Sep 2026',
    );
    expect(formatRangeLabel({ from: '2026-09-10', to: '2026-09-10' })).toBe('10 Sep 2026');
  });

  it('reports change against the previous period, and admits when it cannot', () => {
    expect(percentChange(120, 100)).toBeCloseTo(20);
    expect(percentChange(80, 100)).toBeCloseTo(-20);
    expect(percentChange(0, 0)).toBe(0);
    // Growth from nothing has no meaningful percentage.
    expect(percentChange(5, 0)).toBeNull();
  });
});
