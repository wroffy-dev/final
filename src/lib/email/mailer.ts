import 'server-only';
import nodemailer, { type Transporter } from 'nodemailer';
import { prisma } from '@/lib/db/prisma';
import { getEmailSettings, getWebsiteSettings } from '@/lib/services/settings';
import { decryptSecret } from '@/lib/utils/crypto';
import { DEFAULT_EMAIL_TEMPLATES, renderTemplate } from './templates';

export type SmtpConfig = {
  host: string;
  port: number;
  secure: boolean;
  requireTls: boolean;
  user?: string;
  pass?: string;
  fromName: string;
  fromEmail: string;
  replyTo?: string;
};

/**
 * Database settings win over environment variables so a non-technical admin can
 * change SMTP without a redeploy. Env vars act as the bootstrap fallback.
 */
export async function resolveSmtpConfig(): Promise<SmtpConfig | null> {
  const settings = await getEmailSettings();

  const host = settings.host || process.env.SMTP_HOST || '';
  if (!host) return null;
  if (settings.host && !settings.isEnabled) return null;

  const encryption = settings.host
    ? settings.encryption
    : (process.env.SMTP_ENCRYPTION as string | undefined) ?? 'tls';
  const port = settings.host ? settings.port : Number(process.env.SMTP_PORT || 587);
  const pass = settings.host
    ? decryptSecret(settings.password)
    : process.env.SMTP_PASSWORD || undefined;

  const site = await getWebsiteSettings();
  const envFrom = process.env.MAIL_FROM || '';
  const envFromEmail = envFrom.match(/<([^>]+)>/)?.[1] ?? (envFrom.includes('@') ? envFrom : '');

  const fromEmail = settings.fromEmail || envFromEmail;
  if (!fromEmail) return null;

  return {
    host,
    port,
    secure: encryption === 'ssl',
    requireTls: encryption === 'tls',
    user: settings.host ? settings.username ?? undefined : process.env.SMTP_USER || undefined,
    pass: pass || undefined,
    fromName: settings.fromName || site.siteName,
    fromEmail,
    replyTo: settings.replyTo ?? undefined,
  };
}

export function buildTransport(config: SmtpConfig): Transporter {
  return nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    requireTLS: config.requireTls,
    auth: config.user ? { user: config.user, pass: config.pass ?? '' } : undefined,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  });
}

export type SendResult = { sent: boolean; reason?: string };

export async function sendMail(input: {
  to: string | string[];
  subject: string;
  html: string;
  replyTo?: string;
}): Promise<SendResult> {
  const recipients = (Array.isArray(input.to) ? input.to : [input.to])
    .map((r) => r.trim())
    .filter((r) => r.includes('@'));
  if (recipients.length === 0) return { sent: false, reason: 'No valid recipients' };

  const config = await resolveSmtpConfig();
  if (!config) return { sent: false, reason: 'SMTP is not configured' };

  try {
    const transport = buildTransport(config);
    await transport.sendMail({
      from: `"${config.fromName}" <${config.fromEmail}>`,
      to: recipients.join(', '),
      subject: input.subject,
      html: input.html,
      replyTo: input.replyTo || config.replyTo || undefined,
    });
    return { sent: true };
  } catch (error) {
    console.error('[mailer] send failed', error);
    return { sent: false, reason: error instanceof Error ? error.message : 'Unknown SMTP error' };
  }
}

/** Sends a stored EmailTemplate, falling back to the built-in default. */
export async function sendTemplate(input: {
  key: string;
  to: string | string[];
  tokens: Record<string, string>;
  replyTo?: string;
}): Promise<SendResult> {
  const stored = await prisma.emailTemplate.findUnique({ where: { key: input.key } });
  if (stored && !stored.isActive) return { sent: false, reason: 'Template disabled' };

  const fallback = DEFAULT_EMAIL_TEMPLATES.find((t) => t.key === input.key);
  const subject = stored?.subject ?? fallback?.subject;
  const body = stored?.body ?? fallback?.body;
  if (!subject || !body) return { sent: false, reason: `Unknown template: ${input.key}` };

  return sendMail({
    to: input.to,
    subject: renderTemplate(subject, input.tokens),
    html: wrapHtml(renderTemplate(body, input.tokens)),
    replyTo: input.replyTo,
  });
}

function wrapHtml(inner: string): string {
  return `<!doctype html><html><body style="margin:0;padding:24px;background:#f5f7fb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#0b1b34">
<div style="max-width:640px;margin:0 auto;background:#ffffff;border:1px solid #e3e8f0;border-radius:12px;padding:28px;line-height:1.6">${inner}</div>
</body></html>`;
}

/** Verifies the SMTP connection without sending mail. Used by the settings UI. */
export async function verifySmtp(override?: Partial<SmtpConfig>): Promise<SendResult> {
  const base = await resolveSmtpConfig();
  const config = base ? { ...base, ...override } : (override as SmtpConfig | undefined);
  if (!config?.host) return { sent: false, reason: 'SMTP host is not configured' };
  try {
    await buildTransport(config).verify();
    return { sent: true };
  } catch (error) {
    return { sent: false, reason: error instanceof Error ? error.message : 'Connection failed' };
  }
}
