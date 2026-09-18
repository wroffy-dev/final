'use client';

import * as React from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, Eye, EyeOff, Copy, Trash, Plus, ArrowUp, ArrowDown } from 'lucide-react';
import { getBlock } from '@/lib/cms/blocks';
import { RowMenu, RowMenuItem } from '@/components/admin/row-menu';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/states';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils/cn';
import type { BuilderSection } from './section-builder';

/**
 * The page's section outline.
 *
 * This is the structural view of the page: what is on it, in what order, and
 * what is currently hidden. Selecting a row opens it in the editor panel;
 * dragging reorders it. Move up/down are kept as keyboard-reachable equivalents
 * of the drag handle.
 */
export function SectionListPanel({
  sections,
  selectedId,
  canEdit,
  busy,
  label = 'Sections',
  /**
   * Stable identity for the drag context.
   *
   * dnd-kit otherwise derives one from a module-level counter, which the server
   * and the browser do not advance in step — so the generated `aria-describedby`
   * differs between the two renders and React reports a hydration mismatch.
   */
  dndId = 'sections',
  emptyTitle = 'No sections yet',
  emptyDescription = 'Start with a hero, then build the page up section by section.',
  onSelect,
  onReorder,
  onToggleVisibility,
  onDuplicate,
  onDelete,
  onAdd,
}: {
  sections: BuilderSection[];
  selectedId: string | null;
  canEdit: boolean;
  busy: boolean;
  label?: string;
  dndId?: string;
  emptyTitle?: string;
  emptyDescription?: string;
  onSelect: (id: string) => void;
  onReorder: (ordered: BuilderSection[]) => void;
  onToggleVisibility: (id: string) => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
  onAdd: () => void;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  function onDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const from = sections.findIndex((section) => section.id === active.id);
    const to = sections.findIndex((section) => section.id === over.id);
    if (from < 0 || to < 0) return;
    onReorder(arrayMove(sections, from, to));
  }

  function move(id: string, delta: number) {
    const from = sections.findIndex((section) => section.id === id);
    const to = from + delta;
    if (from < 0 || to < 0 || to >= sections.length) return;
    onReorder(arrayMove(sections, from, to));
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-hairline px-3 py-2.5">
        <h2 className="text-sm font-semibold text-content">
          {label}
          <span className="ml-1.5 text-xs font-normal text-muted">{sections.length}</span>
        </h2>
        {canEdit ? (
          <Button size="sm" variant="outline" onClick={onAdd} disabled={busy}>
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            Add
          </Button>
        ) : null}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {sections.length === 0 ? (
          <EmptyState
            icon={<Plus className="h-5 w-5" />}
            title={emptyTitle}
            description={emptyDescription}
            action={canEdit ? <Button onClick={onAdd}>Add your first one</Button> : undefined}
            className="py-10"
          />
        ) : (
          <DndContext
            id={`section-outline-${dndId}`}
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={onDragEnd}
          >
            <SortableContext
              items={sections.map((section) => section.id)}
              strategy={verticalListSortingStrategy}
            >
              <ul className="space-y-1">
                {sections.map((section, index) => (
                  <SortableRow
                    key={section.id}
                    section={section}
                    index={index}
                    selected={section.id === selectedId}
                    canEdit={canEdit}
                    canMoveUp={index > 0}
                    canMoveDown={index < sections.length - 1}
                    onSelect={() => onSelect(section.id)}
                    onMoveUp={() => move(section.id, -1)}
                    onMoveDown={() => move(section.id, 1)}
                    onToggleVisibility={() => onToggleVisibility(section.id)}
                    onDuplicate={() => onDuplicate(section.id)}
                    onDelete={() => onDelete(section.id)}
                  />
                ))}
              </ul>
            </SortableContext>
          </DndContext>
        )}
      </div>
    </div>
  );
}

function SortableRow({
  section,
  index,
  selected,
  canEdit,
  canMoveUp,
  canMoveDown,
  onSelect,
  onMoveUp,
  onMoveDown,
  onToggleVisibility,
  onDuplicate,
  onDelete,
}: {
  section: BuilderSection;
  index: number;
  selected: boolean;
  canEdit: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onSelect: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onToggleVisibility: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: section.id,
    disabled: !canEdit,
  });

  const definition = getBlock(section.blockType);
  const label = section.name || definition?.label || section.blockType;
  // A one-per-surface block is part of the layout's anatomy: it can be
  // reordered, hidden and styled, but not copied or thrown away.
  const fixed = Boolean(definition?.singleton);

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        'group rounded-lg border transition-colors',
        selected
          ? 'border-brand bg-brand/[0.06]'
          : 'border-transparent hover:border-hairline hover:bg-muted/[0.04]',
        isDragging && 'border-brand opacity-80 shadow-lg',
        !section.isVisible && 'opacity-60',
      )}
    >
      <div className="flex items-center gap-1 px-1.5 py-1.5">
        <button
          type="button"
          {...attributes}
          {...listeners}
          aria-label={`Reorder ${label}`}
          disabled={!canEdit}
          className="shrink-0 cursor-grab rounded p-1 text-muted/60 hover:text-muted active:cursor-grabbing disabled:cursor-not-allowed disabled:opacity-40"
        >
          <GripVertical className="h-3.5 w-3.5" aria-hidden="true" />
        </button>

        <button
          type="button"
          onClick={onSelect}
          aria-current={selected ? 'true' : undefined}
          className="min-w-0 flex-1 py-0.5 text-left"
        >
          <span className="flex items-center gap-1.5">
            <span className="w-4 shrink-0 text-[0.625rem] font-medium text-muted">{index + 1}</span>
            <span
              className={cn(
                'min-w-0 flex-1 truncate text-[0.8125rem]',
                selected ? 'font-medium text-brand' : 'text-content',
              )}
            >
              {label}
            </span>
          </span>
          <span className="ml-[1.375rem] block truncate text-[0.6875rem] text-muted">
            {definition?.label ?? 'Unknown block'}
          </span>
        </button>

        {!section.isVisible ? (
          <EyeOff className="h-3.5 w-3.5 shrink-0 text-muted" aria-label="Hidden" />
        ) : null}
        {!definition ? <Badge tone="danger">Unknown</Badge> : null}

        {canEdit ? (
          <RowMenu label={`Actions for ${label}`}>
            <RowMenuItem onClick={onSelect}>Edit section</RowMenuItem>
            <RowMenuItem onClick={onToggleVisibility}>
              {section.isVisible ? (
                <>
                  <EyeOff className="h-3.5 w-3.5" aria-hidden="true" />
                  Hide on website
                </>
              ) : (
                <>
                  <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                  Show on website
                </>
              )}
            </RowMenuItem>
            {fixed ? null : (
              <RowMenuItem onClick={onDuplicate}>
                <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                Duplicate
              </RowMenuItem>
            )}
            <RowMenuItem onClick={onMoveUp} disabled={!canMoveUp}>
              <ArrowUp className="h-3.5 w-3.5" aria-hidden="true" />
              Move up
            </RowMenuItem>
            <RowMenuItem onClick={onMoveDown} disabled={!canMoveDown}>
              <ArrowDown className="h-3.5 w-3.5" aria-hidden="true" />
              Move down
            </RowMenuItem>
            {fixed ? null : (
              <RowMenuItem tone="danger" onClick={onDelete}>
                <Trash className="h-3.5 w-3.5" aria-hidden="true" />
                Delete
              </RowMenuItem>
            )}
          </RowMenu>
        ) : null}
      </div>
    </li>
  );
}
