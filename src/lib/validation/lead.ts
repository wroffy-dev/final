import { z } from 'zod';

const optional = (max: number) =>
  z
    .string()
    .max(max)
    .transform((v) => v.trim())
    .optional()
    .nullable()
    .transform((v) => (v ? v : null));

export const leadStatusSchema = z.enum([
  'NEW',
  'CONTACTED',
  'QUALIFIED',
  'PROPOSAL',
  'NEGOTIATION',
  'WON',
  'LOST',
  'SPAM',
]);

export const leadInputSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(160),
  email: z.string().trim().email('Enter a valid email address').max(320),
  phone: optional(30),
  company: optional(160),
  jobTitle: optional(120),
  message: optional(4000),
  status: leadStatusSchema.default('NEW'),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH']).default('MEDIUM'),
  source: optional(120),
  campaign: optional(160),
  productId: optional(40),
  assignedToId: optional(40),
  customerId: optional(40),
  followUpAt: z
    .string()
    .optional()
    .nullable()
    .transform((v) => (v ? new Date(v) : null))
    .refine((d) => d === null || !Number.isNaN(d.getTime()), 'Enter a valid date'),
  lostReason: optional(500),
  value: z
    .string()
    .max(20)
    .optional()
    .nullable()
    .transform((v) => (v && v.trim() ? v.replace(/[,\s]/g, '') : null))
    .refine((v) => v === null || /^\d+(\.\d{1,2})?$/.test(v), 'Enter an amount like 250000'),
});

export type LeadInput = z.infer<typeof leadInputSchema>;

export const leadNoteSchema = z.object({
  leadId: z.string().min(1),
  body: z.string().trim().min(1, 'Write something first').max(4000),
});

export const leadStatusChangeSchema = z.object({
  leadId: z.string().min(1),
  status: leadStatusSchema,
  lostReason: optional(500),
});

export const leadAssignSchema = z.object({
  leadId: z.string().min(1),
  assignedToId: z.string().max(40).nullable(),
});

export const pipelineMoveSchema = z.object({
  leadId: z.string().min(1),
  status: leadStatusSchema,
  /** Ordered lead ids in the destination column, for stable manual ordering. */
  order: z.array(z.string().min(1)).max(500).default([]),
});

export const leadBulkSchema = z.object({
  ids: z.array(z.string().min(1)).min(1).max(200),
  action: z.enum(['status', 'assign', 'delete']),
  status: leadStatusSchema.optional(),
  assignedToId: z.string().max(40).nullable().optional(),
});

export const customerInputSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(160),
  company: optional(160),
  email: z.string().trim().email('Enter a valid email address').max(320),
  phone: optional(30),
  website: optional(300),
  address: optional(600),
  gstin: optional(30),
  status: z.enum(['PROSPECT', 'ACTIVE', 'INACTIVE', 'FORMER']).default('PROSPECT'),
  assignedToId: optional(40),
});
