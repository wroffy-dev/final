import type { LeadStatus } from '@prisma/client';

/**
 * Shared CRM vocabulary.
 *
 * Deliberately free of `server-only` imports so client components (badges,
 * pipeline board, filters) can use the same labels as the server.
 */
export const LEAD_STATUS_LABELS: Record<LeadStatus, string> = {
  NEW: 'New',
  CONTACTED: 'Contacted',
  QUALIFIED: 'Qualified',
  PROPOSAL: 'Proposal',
  NEGOTIATION: 'Negotiation',
  WON: 'Won',
  LOST: 'Lost',
  SPAM: 'Spam',
};

/** Stages shown on the Kanban board, in order. WON/LOST close the pipeline. */
export const PIPELINE_STAGES = [
  'NEW',
  'CONTACTED',
  'QUALIFIED',
  'PROPOSAL',
  'NEGOTIATION',
  'WON',
  'LOST',
] as const;

export type PipelineStage = (typeof PIPELINE_STAGES)[number];

export const LEAD_STATUS_OPTIONS = (Object.keys(LEAD_STATUS_LABELS) as LeadStatus[]).map((value) => ({
  value,
  label: LEAD_STATUS_LABELS[value],
}));

export const LEAD_PRIORITY_LABELS: Record<string, string> = {
  LOW: 'Low',
  MEDIUM: 'Medium',
  HIGH: 'High',
};

export const CUSTOMER_STATUS_LABELS: Record<string, string> = {
  PROSPECT: 'Prospect',
  ACTIVE: 'Active',
  INACTIVE: 'Inactive',
  FORMER: 'Former',
};

export const CONTENT_STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Draft',
  PUBLISHED: 'Published',
  SCHEDULED: 'Scheduled',
  ARCHIVED: 'Archived',
};
