'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  closestCorners,
  useDroppable,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { useSortable, SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, Building2, CalendarClock } from 'lucide-react';
import type { LeadStatus } from '@prisma/client';
import { moveLeadInPipeline } from '@/lib/actions/leads';
import { PIPELINE_STAGES, LEAD_STATUS_LABELS } from '@/lib/crm/constants';
import { useToast } from '@/components/ui/toast';
import { formatRelative, formatDate, initials } from '@/lib/utils/format';
import { formatMoney } from '@/lib/utils/money';
import { cn } from '@/lib/utils/cn';

export type PipelineCard = {
  id: string;
  reference: number;
  name: string;
  company: string | null;
  productName: string | null;
  assignedToName: string | null;
  value: string | null;
  status: LeadStatus;
  createdAt: string;
  followUpAt: string | null;
};

const STAGE_TONE: Record<string, string> = {
  NEW: 'border-t-brand',
  CONTACTED: 'border-t-sky-400',
  QUALIFIED: 'border-t-violet-400',
  PROPOSAL: 'border-t-amber-400',
  NEGOTIATION: 'border-t-orange-400',
  WON: 'border-t-emerald-500',
  LOST: 'border-t-red-400',
};

export function PipelineBoard({ cards, canEdit }: { cards: PipelineCard[]; canEdit: boolean }) {
  const router = useRouter();
  const { toast } = useToast();
  const [columns, setColumns] = React.useState<Record<string, PipelineCard[]>>(() => group(cards));
  const [activeId, setActiveId] = React.useState<string | null>(null);

  React.useEffect(() => setColumns(group(cards)), [cards]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor),
  );

  const activeCard = activeId
    ? Object.values(columns)
        .flat()
        .find((card) => card.id === activeId)
    : null;

  function findColumn(cardId: string): string | null {
    for (const [stage, list] of Object.entries(columns)) {
      if (list.some((card) => card.id === cardId)) return stage;
    }
    return null;
  }

  async function onDragEnd(event: DragEndEvent) {
    setActiveId(null);
    const { active, over } = event;
    if (!over) return;

    const from = findColumn(String(active.id));
    // The drop target is either a column or another card inside one.
    const to = PIPELINE_STAGES.includes(String(over.id) as never)
      ? String(over.id)
      : findColumn(String(over.id));
    if (!from || !to) return;

    const card = columns[from]?.find((c) => c.id === active.id);
    if (!card) return;

    const previous = columns;
    const next: Record<string, PipelineCard[]> = { ...columns };
    next[from] = (next[from] ?? []).filter((c) => c.id !== card.id);

    const destination = [...(next[to] ?? [])];
    const overIndex = destination.findIndex((c) => c.id === over.id);
    const insertAt = overIndex >= 0 ? overIndex : destination.length;
    destination.splice(insertAt, 0, { ...card, status: to as LeadStatus });
    next[to] = destination;

    setColumns(next); // optimistic

    const result = await moveLeadInPipeline({
      leadId: card.id,
      status: to,
      order: destination.map((c) => c.id),
    });

    if (!result.ok) {
      setColumns(previous);
      toast(result.error, 'error');
      return;
    }
    if (from !== to) {
      toast(result.message ?? 'Lead moved.');
      router.refresh();
    }
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={(event: DragStartEvent) => setActiveId(String(event.active.id))}
      onDragEnd={onDragEnd}
      onDragCancel={() => setActiveId(null)}
    >
      <div className="scroll-x -mx-4 px-4 pb-4 sm:-mx-6 sm:px-6">
        <div className="flex min-w-max gap-4">
          {PIPELINE_STAGES.map((stage) => (
            <Column key={stage} stage={stage} cards={columns[stage] ?? []} canEdit={canEdit} />
          ))}
        </div>
      </div>

      <DragOverlay>
        {activeCard ? <Card card={activeCard} canEdit={false} isOverlay /> : null}
      </DragOverlay>
    </DndContext>
  );
}

function group(cards: PipelineCard[]): Record<string, PipelineCard[]> {
  const result: Record<string, PipelineCard[]> = {};
  for (const stage of PIPELINE_STAGES) result[stage] = [];
  for (const card of cards) {
    (result[card.status] ??= []).push(card);
  }
  return result;
}

function Column({
  stage,
  cards,
  canEdit,
}: {
  stage: string;
  cards: PipelineCard[];
  canEdit: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: stage });
  const total = cards.reduce((sum, card) => sum + Number(card.value ?? 0), 0);

  return (
    <section
      ref={setNodeRef}
      aria-label={LEAD_STATUS_LABELS[stage as LeadStatus]}
      className={cn(
        'flex w-72 shrink-0 flex-col rounded-xl border border-t-4 bg-muted/[0.03] transition-colors',
        STAGE_TONE[stage] ?? 'border-t-muted',
        isOver ? 'border-brand bg-brand/[0.05]' : 'border-hairline',
      )}
    >
      <header className="px-3 py-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="truncate text-sm font-semibold text-content">
            {LEAD_STATUS_LABELS[stage as LeadStatus]}
          </h2>
          <span className="shrink-0 rounded-full bg-muted/15 px-2 py-0.5 text-xs font-semibold text-muted">
            {cards.length}
          </span>
        </div>
        <p className="mt-0.5 text-xs text-muted">
          {total > 0 ? formatMoney(String(total)) : 'No value set'}
        </p>
      </header>

      <SortableContext items={cards.map((c) => c.id)} strategy={verticalListSortingStrategy}>
        <ul className="flex min-h-24 flex-1 flex-col gap-2 px-2 pb-3">
          {cards.length === 0 ? (
            <li className="rounded-lg border border-dashed border-hairline px-3 py-6 text-center text-xs text-muted">
              Drop a lead here
            </li>
          ) : (
            cards.map((card) => (
              <li key={card.id}>
                <SortableCard card={card} canEdit={canEdit} />
              </li>
            ))
          )}
        </ul>
      </SortableContext>
    </section>
  );
}

function SortableCard({ card, canEdit }: { card: PipelineCard; canEdit: boolean }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: card.id,
    disabled: !canEdit,
  });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(isDragging && 'opacity-40')}
    >
      <Card card={card} canEdit={canEdit} dragHandleProps={{ ...attributes, ...listeners }} />
    </div>
  );
}

function Card({
  card,
  canEdit,
  dragHandleProps,
  isOverlay,
}: {
  card: PipelineCard;
  canEdit: boolean;
  dragHandleProps?: Record<string, unknown>;
  isOverlay?: boolean;
}) {
  // Same overdue rule as the leads table, so a lead reads identically in both views.
  const overdue = Boolean(card.followUpAt && new Date(card.followUpAt) <= new Date());

  return (
    <article
      className={cn(
        'rounded-lg border bg-surface p-3 shadow-sm transition-shadow hover:shadow-md',
        overdue ? 'border-amber-300' : 'border-hairline',
        isOverlay && 'rotate-1 shadow-xl',
      )}
    >
      <div className="flex items-start gap-1.5">
        {canEdit ? (
          <button
            type="button"
            {...dragHandleProps}
            aria-label={`Move ${card.name}`}
            className="-ml-1 cursor-grab rounded p-1 text-muted hover:bg-muted/10 active:cursor-grabbing"
          >
            <GripVertical className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        ) : null}
        <div className="min-w-0 flex-1">
          <Link
            href={`/admin/leads/${card.id}`}
            className="block truncate text-sm font-medium text-content hover:text-brand"
          >
            {card.name}
          </Link>
          {card.company ? (
            <span className="mt-0.5 flex items-center gap-1 truncate text-xs text-muted">
              <Building2 className="h-3 w-3 shrink-0" aria-hidden="true" />
              {card.company}
            </span>
          ) : null}
        </div>
        <span className="shrink-0 font-mono text-[0.625rem] text-muted">#{card.reference}</span>
      </div>

      {card.productName ? (
        <p className="mt-2 truncate rounded bg-muted/10 px-1.5 py-0.5 text-[0.6875rem] text-muted">
          {card.productName}
        </p>
      ) : null}

      {overdue ? (
        <p className="mt-2 flex items-center gap-1 text-[0.6875rem] font-medium text-amber-700">
          <CalendarClock className="h-3 w-3 shrink-0" aria-hidden="true" />
          Follow-up due {formatDate(card.followUpAt as string)}
        </p>
      ) : null}

      <div className="mt-2.5 flex items-center justify-between gap-2 border-t border-hairline pt-2 text-[0.6875rem] text-muted">
        <span
          className="flex min-w-0 items-center gap-1.5"
          title={card.assignedToName ?? 'Unassigned'}
        >
          <span
            aria-hidden="true"
            className={cn(
              'flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[0.5625rem] font-semibold',
              card.assignedToName ? 'bg-brand/10 text-brand' : 'bg-muted/15 text-muted',
            )}
          >
            {card.assignedToName ? initials(card.assignedToName) : '—'}
          </span>
          <span className="truncate">{card.assignedToName ?? 'Unassigned'}</span>
        </span>
        <span className="shrink-0 whitespace-nowrap">
          {card.value ? (
            <span className="font-medium text-content">{formatMoney(card.value)}</span>
          ) : (
            formatRelative(card.createdAt)
          )}
        </span>
      </div>
    </article>
  );
}
