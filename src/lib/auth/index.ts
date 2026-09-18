import 'server-only';
import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import { z } from 'zod';
import { prisma } from '@/lib/db/prisma';
import { verifyPassword } from '@/lib/auth/password';
import { authConfig } from '@/lib/auth/config';
import { rateLimit } from '@/lib/utils/rate-limit';
import { hashIp } from '@/lib/utils/crypto';
import { clientIp } from '@/lib/utils/request';
import { createPendingSession } from '@/lib/auth/session.service';
import { recordSecurityEvent } from '@/lib/security/security-log';

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      name: 'Credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(raw) {
        const parsed = credentialsSchema.safeParse(raw);
        if (!parsed.success) return null;

        const email = parsed.data.email.toLowerCase().trim();

        // Throttle by address and by source IP so neither a single account nor
        // a single origin can be brute-forced.
        const ipKey = hashIp(await clientIp().catch(() => null)) ?? 'unknown';
        if (!rateLimit(`login:email:${email}`, 8, 900).ok) return null;
        if (!rateLimit(`login:ip:${ipKey}`, 20, 900).ok) return null;
        const user = await prisma.user.findFirst({
          where: { email, deletedAt: null },
          include: {
            roles: { include: { permissions: { include: { permission: true } } } },
          },
        });

        // Constant-ish work regardless of user existence to blunt user enumeration.
        if (!user || !user.passwordHash) {
          await verifyPassword(parsed.data.password, '$2a$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidin');
          return null;
        }
        if (user.status !== 'ACTIVE') return null;

        const ok = await verifyPassword(parsed.data.password, user.passwordHash);
        if (!ok) {
          await recordSecurityEvent({
            userId: user.id,
            userEmail: user.email,
            action: 'LOGIN_FAILED',
            summary: 'Incorrect password',
          });
          return null;
        }

        await prisma.user.update({
          where: { id: user.id },
          data: { lastLoginAt: new Date() },
        });

        // A correct password opens a *pending* session and nothing more. It
        // carries no privilege until the second factor is answered, which is
        // checked against the database on every request rather than trusted
        // from the token. See src/lib/auth/session.service.ts.
        const sid = await createPendingSession(user.id);

        await recordSecurityEvent({
          userId: user.id,
          userEmail: user.email,
          action: 'LOGIN_SUCCESS',
          summary: 'Password accepted; awaiting two-step verification',
        });

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          image: user.image ?? undefined,
          role: user.roles.slug,
          permissions: user.roles.permissions.map((rp) => rp.permission.key),
          sid,
        };
      },
    }),
  ],
});
