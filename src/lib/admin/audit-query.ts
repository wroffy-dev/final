import type { Prisma } from '@prisma/client';

export type AuditFilters = {
  q?: string;
  /** Audited model name, e.g. "Lead". */
  entity?: string;
  /** Staff member who made the change. */
  actor?: string;
  /** Recorded action, e.g. "updated". */
  action?: string;
  /** Inclusive yyyy-mm-dd bounds on when the change happened. */
  from?: string;
  to?: string;
};

/**
 * Turns the audit log's query string into one Prisma filter.
 *
 * Every clause narrows the result — filters combine with AND, never OR, so
 * adding a filter can only ever show fewer entries. Only the free-text search
 * fans out across columns, and it does so inside its own OR.
 */
export function buildAuditWhere(filters: AuditFilters): Prisma.AuditLogWhereInput {
  const where: Prisma.AuditLogWhereInput = {};

  const q = filters.q?.trim();
  if (q) {
    where.OR = [
      { summary: { contains: q, mode: 'insensitive' } },
      { actorEmail: { contains: q, mode: 'insensitive' } },
      { action: { contains: q, mode: 'insensitive' } },
    ];
  }

  if (filters.entity) where.entity = filters.entity;
  if (filters.actor) where.actorId = filters.actor;
  if (filters.action) where.action = filters.action;

  if (filters.from || filters.to) {
    where.createdAt = {
      ...(filters.from ? { gte: new Date(`${filters.from}T00:00:00`) } : {}),
      ...(filters.to ? { lte: new Date(`${filters.to}T23:59:59.999`) } : {}),
    };
  }

  return where;
}
