import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { mockAuth, uniqueSuffix } from '../helpers';

mockAuth();

const { prisma } = await import('@/lib/db/prisma');
const { submitForm } = await import('@/lib/actions/submit-form');
const { createCaptchaChallenge } = await import('@/lib/forms/captcha');
const { __resetRateLimits } = await import('@/lib/utils/rate-limit');

const suffix = uniqueSuffix();
const protectedSlug = `captcha-form-${suffix}`;
const openSlug = `open-form-${suffix}`;

/** Answers the question the way a visitor would — by reading it. */
function solve(question: string): number {
  const match = question.match(/What is (\d+) ([+−]) (\d+)\?/);
  if (!match) throw new Error(`unparseable question: ${question}`);
  const [, a, op, b] = match;
  return op === '+' ? Number(a) + Number(b) : Number(a) - Number(b);
}

async function makeForm(slug: string, requireCaptcha: boolean) {
  return prisma.form.create({
    data: {
      name: slug,
      slug,
      isActive: true,
      requireCaptcha,
      fields: {
        create: [
          {
            type: 'NAME',
            label: 'Name',
            name: 'name',
            isRequired: true,
            sortOrder: 0,
            width: 'full',
          },
          {
            type: 'EMAIL',
            label: 'Email',
            name: 'email',
            isRequired: true,
            sortOrder: 1,
            width: 'full',
          },
        ],
      },
    },
  });
}

function payload(slug: string, extra: Record<string, unknown> = {}) {
  return {
    /*
     * Every form now asks for consent, so a submission that omits it is
     * rejected — which is the point. The helper ticks the required box so
     * these tests keep testing what they are about.
     */
    consent: { enquiry: true, marketing: false, terms: false },
    formSlug: slug,
    elapsedMs: 5000,
    values: {
      name: 'Grace Hopper',
      email: `grace+${suffix}-${Math.random().toString(36).slice(2, 8)}@example.test`,
    },
    ...extra,
  };
}

beforeAll(async () => {
  await makeForm(protectedSlug, true);
  await makeForm(openSlug, false);
});

beforeEach(() => {
  // The submission limiter is per-form-per-IP; these tests submit repeatedly.
  __resetRateLimits();
});

afterAll(async () => {
  const slugs = [protectedSlug, openSlug];
  const forms = await prisma.form.findMany({
    where: { slug: { in: slugs } },
    select: { id: true },
  });
  const ids = forms.map((form) => form.id);
  await prisma.formSubmission.deleteMany({ where: { formId: { in: ids } } });
  await prisma.lead.deleteMany({ where: { formId: { in: ids } } });
  await prisma.formField.deleteMany({ where: { formId: { in: ids } } });
  await prisma.form.deleteMany({ where: { id: { in: ids } } });
  await prisma.$disconnect();
});

describe('captcha-protected form submission', () => {
  it('accepts a submission with the correct answer, creating exactly one lead and one submission', async () => {
    const challenge = createCaptchaChallenge();
    const email = `once+${suffix}@example.test`;

    const result = await submitForm({
      ...payload(protectedSlug),
      values: { name: 'Grace Hopper', email },
      captchaToken: challenge.token,
      captchaAnswer: String(solve(challenge.question)),
    });

    expect(result.ok).toBe(true);

    expect(await prisma.lead.count({ where: { email } })).toBe(1);
    const lead = await prisma.lead.findFirstOrThrow({ where: { email }, select: { id: true } });
    expect(await prisma.formSubmission.count({ where: { leadId: lead.id } })).toBe(1);
  });

  it('rejects a wrong answer and writes nothing', async () => {
    const challenge = createCaptchaChallenge();
    const email = `wrong+${suffix}@example.test`;

    const result = await submitForm({
      ...payload(protectedSlug),
      values: { name: 'Grace Hopper', email },
      captchaToken: challenge.token,
      captchaAnswer: String(solve(challenge.question) + 3),
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('Incorrect verification answer. Please try again.');
    expect(await prisma.lead.count({ where: { email } })).toBe(0);
    expect(
      await prisma.formSubmission.count({
        where: { form: { slug: protectedSlug }, data: { path: ['email'], equals: email } },
      }),
    ).toBe(0);
  });

  it('rejects a missing answer and a missing token', async () => {
    const challenge = createCaptchaChallenge();

    const noAnswer = await submitForm({
      ...payload(protectedSlug),
      captchaToken: challenge.token,
    });
    expect(noAnswer.ok).toBe(false);

    const noToken = await submitForm({
      ...payload(protectedSlug),
      captchaAnswer: '5',
    });
    expect(noToken.ok).toBe(false);

    const neither = await submitForm(payload(protectedSlug));
    expect(neither.ok).toBe(false);
  });

  it('rejects an expired token with the regeneration message', async () => {
    // A token whose expiry has already passed, signed correctly at the time.
    const challenge = createCaptchaChallenge(5 * 60);
    const answer = solve(challenge.question);
    const email = `expired+${suffix}@example.test`;

    // Move the clock past the expiry rather than forging the token.
    const realNow = Date.now;
    Date.now = () => realNow() + 16 * 60 * 1000;
    try {
      const result = await submitForm({
        ...payload(protectedSlug),
        values: { name: 'Grace Hopper', email },
        captchaToken: challenge.token,
        captchaAnswer: String(answer),
      });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBe('Verification expired. A new question has been generated.');
      }
    } finally {
      Date.now = realNow;
    }

    expect(await prisma.lead.count({ where: { email } })).toBe(0);
  });

  it('rejects a tampered token without revealing why', async () => {
    const challenge = createCaptchaChallenge();
    const [version, a, b, operation, expiry] = challenge.token.split('.');
    const email = `tampered+${suffix}@example.test`;

    const result = await submitForm({
      ...payload(protectedSlug),
      values: { name: 'Grace Hopper', email },
      captchaToken: [version, a, b, operation, expiry, 'forged-signature'].join('.'),
      captchaAnswer: String(solve(challenge.question)),
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("We couldn't verify the form. Please try again.");
      expect(result.error).not.toMatch(/signature|hmac|secret/i);
    }
    expect(await prisma.lead.count({ where: { email } })).toBe(0);
  });

  it('lets a form without the CAPTCHA submit exactly as before', async () => {
    const email = `open+${suffix}@example.test`;

    const result = await submitForm({
      ...payload(openSlug),
      values: { name: 'Grace Hopper', email },
    });

    expect(result.ok).toBe(true);
    expect(await prisma.lead.count({ where: { email } })).toBe(1);
  });

  it('never stores the CAPTCHA answer or token anywhere', async () => {
    const challenge = createCaptchaChallenge();
    const answer = solve(challenge.question);
    const email = `privacy+${suffix}@example.test`;

    const result = await submitForm({
      ...payload(protectedSlug),
      values: { name: 'Grace Hopper', email },
      captchaToken: challenge.token,
      captchaAnswer: String(answer),
    });
    expect(result.ok).toBe(true);

    const lead = await prisma.lead.findFirstOrThrow({ where: { email } });
    const submission = await prisma.formSubmission.findFirstOrThrow({ where: { leadId: lead.id } });

    // The stored submission holds only the visitor's own field values.
    expect(Object.keys(submission.data as Record<string, unknown>).sort()).toEqual([
      'email',
      'name',
    ]);

    const haystack = `${JSON.stringify(lead)}${JSON.stringify(submission)}`;
    expect(haystack).not.toContain(challenge.token);
    expect(haystack).not.toContain('captchaAnswer');
    expect(haystack).not.toContain('captchaToken');

    // And nothing about it reaches the audit log either.
    const audit = await prisma.auditLog.findMany({ where: { entity: 'Lead', entityId: lead.id } });
    expect(JSON.stringify(audit)).not.toContain(challenge.token);
  });

  it('still applies the honeypot and fill-time gates on a protected form', async () => {
    const challenge = createCaptchaChallenge();
    const answer = String(solve(challenge.question));

    // A filled honeypot is answered with a bland success and stores nothing.
    const botEmail = `bot+${suffix}@example.test`;
    const trapped = await submitForm({
      ...payload(protectedSlug),
      values: { name: 'Bot', email: botEmail },
      website: 'http://spam.example',
      captchaToken: challenge.token,
      captchaAnswer: answer,
    });
    expect(trapped.ok).toBe(true);
    expect(await prisma.lead.count({ where: { email: botEmail } })).toBe(0);

    // So is a submission that arrived faster than a person could type.
    const fastEmail = `fast+${suffix}@example.test`;
    const tooFast = await submitForm({
      ...payload(protectedSlug),
      elapsedMs: 50,
      values: { name: 'Bot', email: fastEmail },
      captchaToken: challenge.token,
      captchaAnswer: answer,
    });
    expect(tooFast.ok).toBe(false);
    expect(await prisma.lead.count({ where: { email: fastEmail } })).toBe(0);
  });
});
