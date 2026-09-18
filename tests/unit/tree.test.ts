import { describe, it, expect } from 'vitest';
import { descendantIds, canSetParent, flattenTree, ancestorPath } from '@/lib/utils/tree';

const LABELS = {
  self: 'A category cannot be its own parent.',
  cycle: 'That would place a category inside one of its own children.',
  missing: 'That parent category no longer exists.',
};

// Solutions → Cloud → Cloud Backup, and a separate Products → Dropbox.
const tree = [
  { id: 'solutions', parentId: null },
  { id: 'cloud', parentId: 'solutions' },
  { id: 'backup', parentId: 'cloud' },
  { id: 'security', parentId: 'solutions' },
  { id: 'products', parentId: null },
  { id: 'dropbox', parentId: 'products' },
];

describe('descendants', () => {
  it('finds every level below a node, not just its children', () => {
    expect(descendantIds(tree, 'solutions')).toEqual(new Set(['cloud', 'backup', 'security']));
    expect(descendantIds(tree, 'cloud')).toEqual(new Set(['backup']));
    expect(descendantIds(tree, 'backup')).toEqual(new Set());
  });

  it('does not loop forever on data that is already cyclic', () => {
    const cyclic = [
      { id: 'a', parentId: 'b' },
      { id: 'b', parentId: 'a' },
    ];
    expect(descendantIds(cyclic, 'a')).toEqual(new Set(['a', 'b']));
  });
});

describe('re-parenting rules', () => {
  it('allows a move to the top level or under an unrelated node', () => {
    expect(canSetParent(tree, 'cloud', null, LABELS)).toEqual({ ok: true });
    expect(canSetParent(tree, 'cloud', 'products', LABELS)).toEqual({ ok: true });
  });

  it('refuses a node as its own parent', () => {
    expect(canSetParent(tree, 'cloud', 'cloud', LABELS)).toEqual({ ok: false, error: LABELS.self });
  });

  it('refuses a cycle through a direct or distant descendant', () => {
    expect(canSetParent(tree, 'solutions', 'cloud', LABELS)).toEqual({
      ok: false,
      error: LABELS.cycle,
    });
    // Two levels down is still a cycle.
    expect(canSetParent(tree, 'solutions', 'backup', LABELS)).toEqual({
      ok: false,
      error: LABELS.cycle,
    });
  });

  it('refuses a parent that does not exist', () => {
    expect(canSetParent(tree, 'cloud', 'ghost', LABELS)).toEqual({
      ok: false,
      error: LABELS.missing,
    });
  });

  it('only checks the parent exists when creating a new node', () => {
    expect(canSetParent(tree, null, 'cloud', LABELS)).toEqual({ ok: true });
    expect(canSetParent(tree, null, 'ghost', LABELS)).toEqual({ ok: false, error: LABELS.missing });
  });
});

describe('flattening for display', () => {
  const named = [
    { id: 'solutions', parentId: null, name: 'Solutions', sortOrder: 0 },
    { id: 'security', parentId: 'solutions', name: 'Security', sortOrder: 1 },
    { id: 'cloud', parentId: 'solutions', name: 'Cloud', sortOrder: 0 },
    { id: 'products', parentId: null, name: 'Products', sortOrder: 1 },
  ];
  const bySort = (a: { sortOrder: number }, b: { sortOrder: number }) => a.sortOrder - b.sortOrder;

  it('puts each parent directly above its children, with a depth', () => {
    expect(flattenTree(named, bySort).map((row) => [row.node.id, row.depth])).toEqual([
      ['solutions', 0],
      ['cloud', 1],
      ['security', 1],
      ['products', 0],
    ]);
  });

  it('treats an orphan as a root instead of hiding it', () => {
    const orphaned = [...named, { id: 'lost', parentId: 'deleted', name: 'Lost', sortOrder: 9 }];
    const ids = flattenTree(orphaned, bySort).map((row) => row.node.id);
    expect(ids).toContain('lost');
    expect(ids).toHaveLength(5);
  });

  it('still lists every node when the data contains a cycle', () => {
    const cyclic = [
      { id: 'a', parentId: 'b', name: 'A', sortOrder: 0 },
      { id: 'b', parentId: 'a', name: 'B', sortOrder: 0 },
    ];
    expect(flattenTree(cyclic, bySort)).toHaveLength(2);
  });
});

describe('breadcrumbs', () => {
  it('reads from the root down to the node', () => {
    expect(ancestorPath(tree, 'backup').map((node) => node.id)).toEqual([
      'solutions',
      'cloud',
      'backup',
    ]);
    expect(ancestorPath(tree, 'solutions').map((node) => node.id)).toEqual(['solutions']);
  });

  it('terminates on cyclic data', () => {
    const cyclic = [
      { id: 'a', parentId: 'b' },
      { id: 'b', parentId: 'a' },
    ];
    expect(ancestorPath(cyclic, 'a')).toHaveLength(2);
  });
});
