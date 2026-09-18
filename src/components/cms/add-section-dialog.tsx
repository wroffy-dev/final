'use client';

import * as React from 'react';
import { Search } from 'lucide-react';
import {
  BLOCK_GROUPS,
  blocksForSurface,
  type BlockDefinition,
  type BlockSurface,
} from '@/lib/cms/blocks';
import { NavIcon } from '@/components/admin/nav-icon';
import { Dialog } from '@/components/ui/dialog';
import { Input } from '@/components/ui/field';
import { Spinner } from '@/components/ui/icons';
import { cn } from '@/lib/utils/cn';

/**
 * Block picker.
 *
 * The list comes straight from the CMS block registry, so a newly registered
 * block appears here automatically and there is no second list to keep in sync.
 */
export function AddSectionDialog({
  open,
  busy,
  onClose,
  onAdd,
  surface = 'page',
  title = 'Add a section',
  description = 'Pick a block. You can reorder and configure it after adding.',
  /** Types already present that may only appear once. */
  usedSingletons = [],
}: {
  open: boolean;
  busy: boolean;
  onClose: () => void;
  onAdd: (blockType: string) => void;
  surface?: BlockSurface;
  title?: string;
  description?: string;
  usedSingletons?: string[];
}) {
  const [query, setQuery] = React.useState('');

  React.useEffect(() => {
    if (open) setQuery('');
  }, [open]);

  const grouped = React.useMemo(() => {
    const term = query.trim().toLowerCase();
    const matches = (block: BlockDefinition) =>
      !term ||
      block.label.toLowerCase().includes(term) ||
      block.description.toLowerCase().includes(term) ||
      block.group.toLowerCase().includes(term);

    // A block that can only exist once disappears from the picker after it has
    // been added, rather than offering an action that would be refused.
    const available = blocksForSurface(surface).filter(
      (block) => !(block.singleton && usedSingletons.includes(block.type)),
    );

    return BLOCK_GROUPS.map(
      (group) =>
        [group, available.filter((block) => block.group === group && matches(block))] as const,
    ).filter(([, blocks]) => blocks.length > 0);
  }, [query, surface, usedSingletons]);

  const totalMatches = grouped.reduce((sum, [, blocks]) => sum + blocks.length, 0);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      description={description}
      size="lg"
    >
      {busy ? (
        <p className="flex items-center gap-2 py-10 text-sm text-muted">
          <Spinner className="h-4 w-4 animate-spin" aria-hidden="true" />
          Adding section…
        </p>
      ) : (
        <div className="space-y-5">
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted"
              aria-hidden="true"
            />
            <Input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search sections"
              aria-label="Search sections"
              className="pl-9"
              autoFocus
            />
          </div>

          {totalMatches === 0 ? (
            <p className="py-10 text-center text-sm text-muted">No section matches “{query}”.</p>
          ) : (
            grouped.map(([group, blocks]) => (
              <div key={group}>
                <h3 className="mb-2 text-[0.6875rem] font-semibold uppercase tracking-wider text-muted">
                  {group}
                </h3>
                <ul className="grid gap-2 sm:grid-cols-2">
                  {blocks.map((block) => (
                    <li key={block.type}>
                      <button
                        type="button"
                        onClick={() => onAdd(block.type)}
                        className={cn(
                          'flex w-full items-start gap-3 rounded-lg border border-hairline p-3 text-left transition-colors',
                          'hover:border-brand hover:bg-brand/[0.04]',
                        )}
                      >
                        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted/10 text-muted">
                          <NavIcon name={iconKeyFor(block.icon)} className="h-4 w-4" />
                        </span>
                        <span className="min-w-0">
                          <span className="block text-sm font-medium text-content">
                            {block.label}
                          </span>
                          <span className="mt-0.5 block text-xs leading-relaxed text-muted">
                            {block.description}
                          </span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))
          )}
        </div>
      )}
    </Dialog>
  );
}

/** Maps a block registry icon name onto a NavIcon key. */
function iconKeyFor(icon: string): string {
  const map: Record<string, string> = {
    'layout-template': 'layout',
    'grid-3x3': 'chart',
    text: 'file',
    image: 'image',
    package: 'package',
    table: 'chart',
    'circle-help': 'file',
    quote: 'file',
    megaphone: 'megaphone',
    gift: 'gift',
    'clipboard-list': 'clipboard',
    'building-2': 'building',
    'trending-up': 'chart',
    'list-ordered': 'file',
    shield: 'star',
  };
  return map[icon] ?? 'layout';
}
