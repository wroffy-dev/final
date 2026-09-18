import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { Z_INDEX } from '@/lib/ui/z-index';

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) walk(path, out);
    else if (path.endsWith('.tsx') || path.endsWith('.ts')) out.push(path);
  }
  return out;
}

// The scale module itself quotes `z-[9999]` in its prose as the anti-pattern
// it exists to prevent, so it is not a subject of its own scan.
const files = walk('src').filter((file) => !file.endsWith('lib/ui/z-index.ts'));

describe('z-index scale', () => {
  it('orders the layers the way the UI needs them stacked', () => {
    const order = [
      'base',
      'sticky',
      'sidebar',
      'topbar',
      'dropdown',
      'backdrop',
      'drawer',
      'modal',
      'toast',
      'tooltip',
    ] as const;

    expect(Object.keys(Z_INDEX)).toEqual([...order]);
    for (let i = 1; i < order.length; i += 1) {
      expect(Z_INDEX[order[i]]).toBeGreaterThan(Z_INDEX[order[i - 1]]);
    }
  });

  it('keeps the layers that must cover each other in the right order', () => {
    // A dropdown must clear both bars, the drawer must clear its backdrop, and
    // a toast raised by a dialog must still be readable over it.
    expect(Z_INDEX.dropdown).toBeGreaterThan(Z_INDEX.topbar);
    expect(Z_INDEX.topbar).toBeGreaterThan(Z_INDEX.sidebar);
    expect(Z_INDEX.sidebar).toBeGreaterThan(Z_INDEX.sticky);
    expect(Z_INDEX.drawer).toBeGreaterThan(Z_INDEX.backdrop);
    expect(Z_INDEX.modal).toBeGreaterThan(Z_INDEX.drawer);
    expect(Z_INDEX.toast).toBeGreaterThan(Z_INDEX.modal);
    expect(Z_INDEX.tooltip).toBeGreaterThan(Z_INDEX.toast);
  });

  it('has no arbitrary z-[…] values anywhere in the source', () => {
    const offenders = files
      .map((file) => ({ file, hits: readFileSync(file, 'utf8').match(/z-\[\d+\]/g) ?? [] }))
      .filter((entry) => entry.hits.length > 0)
      .map((entry) => `${entry.file}: ${entry.hits.join(', ')}`);

    expect(offenders).toEqual([]);
  });

  it('only uses numeric z-index utilities for local stacking, never for overlays', () => {
    // `z-10`/`-z-10` are fine inside an element that already owns a stacking
    // context (a dialog panel over its own backdrop, a hero background image).
    // They are not fine on something `fixed` or `sticky`, which competes with
    // the whole page and must therefore name a layer.
    const offenders: string[] = [];
    for (const file of files) {
      const source = readFileSync(file, 'utf8');
      for (const line of source.split('\n')) {
        if (!/\bz-\d+\b/.test(line)) continue;
        if (/\b(fixed|sticky)\b/.test(line)) offenders.push(`${file}: ${line.trim().slice(0, 90)}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
