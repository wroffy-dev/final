import { vi } from 'vitest';
import { config } from 'dotenv';

// Load .env so integration tests reach the same database as the app.
config({ path: '.env', quiet: true });

process.env.AUTH_SECRET ??= 'test-secret-value-at-least-16-chars';
process.env.ENCRYPTION_KEY ??= 'test-encryption-key-value-32-bytes!!';
process.env.NEXT_PUBLIC_SITE_URL ??= 'http://localhost:3000';

/*
 * Server Actions depend on request-scoped framework APIs that do not exist
 * under vitest. Only that boundary is stubbed — validation, authorisation and
 * database work all run for real.
 */
vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
  unstable_cache: (fn: unknown) => fn,
}));

vi.mock('@/lib/utils/request', () => ({
  clientIp: async () => '203.0.113.10',
  userAgent: async () => 'vitest',
  requestContext: async () => ({
    ip: '203.0.113.10',
    ipStatus: 'RECORDED',
    userAgent: 'vitest',
  }),
  clientIpResolution: async () => ({ status: 'RECORDED', ip: '203.0.113.10' }),
  ipRetentionDays: () => 365,
}));

vi.mock('@/lib/email/mailer', () => ({
  sendMail: async () => ({ sent: false, reason: 'disabled in tests' }),
  sendTemplate: async () => ({ sent: false, reason: 'disabled in tests' }),
  verifySmtp: async () => ({ sent: false, reason: 'disabled in tests' }),
  resolveSmtpConfig: async () => null,
  buildTransport: () => {
    throw new Error('SMTP transport is not available in tests');
  },
}));
