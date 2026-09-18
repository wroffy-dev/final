/**
 * Shared helpers for the self-referencing hierarchies in this app: page
 * categories, blog categories and media folders.
 *
 * All three can nest without limit, and all three can be corrupted the same
 * two ways — a node made its own parent, or a cycle formed by re-parenting a
 * node under one of its own descendants. A cycle is not a cosmetic problem: it
 * makes every recursive read (breadcrumbs, trees, counts) loop forever. These
 * checks belong in one place rather than being re-derived per feature.
 */

export type TreeNode = { id: string; parentId: string | null };

/** Every descendant of `id`, depth-first. Safe on already-cyclic data. */
export function descendantIds<T extends TreeNode>(nodes: T[], id: string): Set<string> {
  const byParent = new Map<string, T[]>();
  for (const node of nodes) {
    if (!node.parentId) continue;
    const bucket = byParent.get(node.parentId) ?? [];
    bucket.push(node);
    byParent.set(node.parentId, bucket);
  }

  const found = new Set<string>();
  const stack = [id];
  while (stack.length > 0) {
    const current = stack.pop()!;
    for (const child of byParent.get(current) ?? []) {
      // The `has` guard also stops a pre-existing cycle from spinning here.
      if (found.has(child.id)) continue;
      found.add(child.id);
      stack.push(child.id);
    }
  }
  return found;
}

export type ParentCheck = { ok: true } | { ok: false; error: string };

/**
 * Whether `nodeId` may be re-parented under `parentId`.
 *
 * `nodeId` is null when creating, where only the parent's existence matters.
 * The rejection messages are visitor-facing and say what to do instead.
 */
export function canSetParent<T extends TreeNode>(
  nodes: T[],
  nodeId: string | null,
  parentId: string | null,
  labels: { self: string; cycle: string; missing: string },
): ParentCheck {
  if (!parentId) return { ok: true }; // moving to the top level is always fine

  if (!nodes.some((node) => node.id === parentId)) {
    return { ok: false, error: labels.missing };
  }
  if (!nodeId) return { ok: true };

  if (nodeId === parentId) return { ok: false, error: labels.self };
  if (descendantIds(nodes, nodeId).has(parentId)) return { ok: false, error: labels.cycle };

  return { ok: true };
}

export type Flattened<T> = { node: T; depth: number };

/**
 * Flattens a tree into render order — parents immediately followed by their
 * children — with a depth for indentation.
 *
 * Orphans (a parentId pointing at something that no longer exists) are treated
 * as roots rather than dropped, so a row can never disappear from the admin.
 */
export function flattenTree<T extends TreeNode>(
  nodes: T[],
  compare: (a: T, b: T) => number = () => 0,
): Array<Flattened<T>> {
  const ids = new Set(nodes.map((node) => node.id));
  const byParent = new Map<string | null, T[]>();

  for (const node of nodes) {
    const key = node.parentId && ids.has(node.parentId) ? node.parentId : null;
    const bucket = byParent.get(key) ?? [];
    bucket.push(node);
    byParent.set(key, bucket);
  }
  for (const bucket of byParent.values()) bucket.sort(compare);

  const out: Array<Flattened<T>> = [];
  const seen = new Set<string>();

  const walk = (parentId: string | null, depth: number) => {
    for (const node of byParent.get(parentId) ?? []) {
      if (seen.has(node.id)) continue; // defensive: never loop on bad data
      seen.add(node.id);
      out.push({ node, depth });
      walk(node.id, depth + 1);
    }
  };
  walk(null, 0);

  // Anything unreachable from a root (only possible if data is already cyclic)
  // is still listed, so the admin can see and fix it.
  for (const node of nodes) {
    if (!seen.has(node.id)) out.push({ node, depth: 0 });
  }
  return out;
}

/** Ancestor chain from the root down to `id`, for breadcrumbs. */
export function ancestorPath<T extends TreeNode>(nodes: T[], id: string): T[] {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const path: T[] = [];
  const seen = new Set<string>();

  let current = byId.get(id);
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    path.unshift(current);
    current = current.parentId ? byId.get(current.parentId) : undefined;
  }
  return path;
}
