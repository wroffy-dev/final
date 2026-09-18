import 'server-only';
import { prisma } from '@/lib/db/prisma';
import { getEmailSettings, getWebsiteSettings } from '@/lib/services/settings';
import { sendTemplate } from '@/lib/email/mailer';
import { siteUrl } from '@/lib/env';
import type { Lead, LeadActivityType } from '@prisma/client';

export type LeadNotificationContext = {
  lead: Lead & { product?: { name: string } | null; form?: { name: string } | null };
  extraRecipients?: string[];
};

function splitEmails(raw: string | null | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(/[,;\n]/)
    .map((e) => e.trim())
    .filter((e) => e.includes('@'));
}

/** Fire-and-forget notification for a newly captured lead. Never throws. */
export async function notifyNewLead(ctx: LeadNotificationContext): Promise<void> {
  try {
    const [email, site] = await Promise.all([getEmailSettings(), getWebsiteSettings()]);
    if (!email.notifyOnNewLead) return;

    const recipients = Array.from(
      new Set([
        ...splitEmails(email.salesNotificationEmails),
        ...(ctx.extraRecipients ?? []),
        ...splitEmails(site.contactEmail),
      ]),
    );
    if (recipients.length === 0) return;

    const { lead } = ctx;
    await sendTemplate({
      key: 'new_lead',
      to: recipients,
      replyTo: lead.email,
      tokens: {
        site_name: site.siteName,
        lead_name: lead.name,
        lead_email: lead.email,
        lead_phone: lead.phone ?? '—',
        lead_company: lead.company ?? '—',
        lead_message: lead.message ?? '—',
        lead_source: lead.source ?? '—',
        lead_status: lead.status,
        product_name: ctx.lead.product?.name ?? '—',
        product_suffix: ctx.lead.product?.name ? ` — ${ctx.lead.product.name}` : '',
        utm_campaign: lead.utmCampaign ?? '—',
        landing_url: lead.landingUrl ?? '—',
        lead_url: `${siteUrl()}/admin/leads/${lead.id}`,
      },
    });
  } catch (error) {
    console.error('[leads] new-lead notification failed', error);
  }
}

export async function notifyLeadAssignment(input: {
  leadId: string;
  assigneeId: string;
  actorName: string;
}): Promise<void> {
  try {
    const [email, site] = await Promise.all([getEmailSettings(), getWebsiteSettings()]);
    if (!email.notifyOnAssignment) return;

    const [lead, assignee] = await Promise.all([
      prisma.lead.findUnique({ where: { id: input.leadId } }),
      prisma.user.findUnique({ where: { id: input.assigneeId } }),
    ]);
    if (!lead || !assignee) return;

    await sendTemplate({
      key: 'lead_assigned',
      to: assignee.email,
      tokens: {
        site_name: site.siteName,
        assignee_name: assignee.name,
        actor_name: input.actorName,
        lead_name: lead.name,
        lead_email: lead.email,
        lead_phone: lead.phone ?? '—',
        lead_status: lead.status,
        lead_url: `${siteUrl()}/admin/leads/${lead.id}`,
      },
    });
  } catch (error) {
    console.error('[leads] assignment notification failed', error);
  }
}

export async function logLeadActivity(input: {
  leadId: string;
  type: LeadActivityType;
  summary: string;
  actorId?: string | null;
  meta?: Record<string, unknown>;
}): Promise<void> {
  try {
    await prisma.leadActivity.create({
      data: {
        leadId: input.leadId,
        type: input.type,
        summary: input.summary,
        actorId: input.actorId ?? null,
        meta: (input.meta ?? {}) as object,
      },
    });
  } catch (error) {
    console.error('[leads] activity log failed', error);
  }
}

export {
  LEAD_STATUS_LABELS,
  PIPELINE_STAGES,
  type PipelineStage,
} from '@/lib/crm/constants';
