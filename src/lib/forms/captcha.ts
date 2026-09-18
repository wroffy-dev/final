import 'server-only';
import crypto from 'node:crypto';

/**
 * Math CAPTCHA: a small arithmetic question protected by a signed token.
 *
 * The browser is given a *question* and an opaque token. It never receives the
 * expected answer, so a script cannot read the answer out of the page — it
 * would have to actually compute it, which is the point. The token carries the
 * operands and an expiry, signed with the server secret, so nothing has to be
 * stored between the two requests: verification is a signature check plus the
 * same arithmetic the visitor was asked to do.
 *
 * Deliberately limited to addition and small subtraction with a non-negative
 * answer — no division, no decimals, no negative results — because this must
 * stay solvable by a person in a hurry, including one using a screen reader.
 */

const VERSION = 'c1';
const DEFAULT_TTL_SECONDS = 10 * 60; // 10 minutes, inside the 5–15 minute band.

export type CaptchaOperation = 'add' | 'sub';

export type CaptchaChallenge = {
  /** Human-readable question, e.g. "What is 7 + 4?" */
  question: string;
  /** Opaque signed token echoed back with the answer. */
  token: string;
};

export type CaptchaFailure = 'missing' | 'malformed' | 'expired' | 'incorrect';

export type CaptchaResult = { ok: true } | { ok: false; reason: CaptchaFailure };

function secret(): string {
  const raw = process.env.ENCRYPTION_KEY || process.env.AUTH_SECRET || '';
  if (!raw) throw new Error('AUTH_SECRET (or ENCRYPTION_KEY) must be set to sign CAPTCHA tokens');
  return raw;
}

function sign(payload: string): string {
  return crypto.createHmac('sha256', secret()).update(payload).digest('base64url');
}

function expectedAnswer(a: number, b: number, operation: CaptchaOperation): number {
  return operation === 'add' ? a + b : a - b;
}

/** Uniform random integer in [min, max], from a CSPRNG. */
function randomInt(min: number, max: number): number {
  return crypto.randomInt(min, max + 1);
}

/**
 * Builds a fresh question and its signed token.
 *
 * `ttlSeconds` is clamped to 5–15 minutes: shorter is hostile to anyone filling
 * in a long form, longer weakens the point of expiring at all.
 */
export function createCaptchaChallenge(ttlSeconds = DEFAULT_TTL_SECONDS): CaptchaChallenge {
  const ttl = Math.min(Math.max(Math.round(ttlSeconds), 5 * 60), 15 * 60);
  const operation: CaptchaOperation = crypto.randomInt(0, 2) === 0 ? 'add' : 'sub';

  let a: number;
  let b: number;
  if (operation === 'add') {
    a = randomInt(1, 9);
    b = randomInt(1, 9);
  } else {
    // Subtraction is ordered so the answer is never negative.
    a = randomInt(4, 12);
    b = randomInt(1, a - 1);
  }

  const expiresAt = Date.now() + ttl * 1000;
  const payload = `${VERSION}.${a}.${b}.${operation}.${expiresAt}`;

  return {
    question: `What is ${a} ${operation === 'add' ? '+' : '−'} ${b}?`,
    token: `${payload}.${sign(payload)}`,
  };
}

/**
 * Verifies an answer against its token.
 *
 * Order matters: signature first, so a tampered token can never reach the
 * arithmetic; then expiry; then the answer itself.
 */
export function verifyCaptcha(token: unknown, answer: unknown, now = Date.now()): CaptchaResult {
  if (typeof token !== 'string' || token.length === 0) return { ok: false, reason: 'missing' };
  if (answer === null || answer === undefined || String(answer).trim() === '') {
    return { ok: false, reason: 'missing' };
  }

  const parts = token.split('.');
  if (parts.length !== 6) return { ok: false, reason: 'malformed' };

  const [version, rawA, rawB, operation, rawExpiry, signature] = parts;
  if (version !== VERSION) return { ok: false, reason: 'malformed' };
  if (operation !== 'add' && operation !== 'sub') return { ok: false, reason: 'malformed' };

  const payload = `${version}.${rawA}.${rawB}.${operation}.${rawExpiry}`;
  const given = Buffer.from(signature);
  const want = Buffer.from(sign(payload));
  // Constant-time compare, and only once the lengths match — timingSafeEqual throws otherwise.
  if (given.length !== want.length || !crypto.timingSafeEqual(given, want)) {
    return { ok: false, reason: 'malformed' };
  }

  const a = Number(rawA);
  const b = Number(rawB);
  const expiresAt = Number(rawExpiry);
  if (!Number.isFinite(a) || !Number.isFinite(b) || !Number.isFinite(expiresAt)) {
    return { ok: false, reason: 'malformed' };
  }

  if (now > expiresAt) return { ok: false, reason: 'expired' };

  const submitted = Number(String(answer).trim());
  if (!Number.isInteger(submitted)) return { ok: false, reason: 'incorrect' };
  if (submitted !== expectedAnswer(a, b, operation)) return { ok: false, reason: 'incorrect' };

  return { ok: true };
}

/** Visitor-facing wording. Never leaks why a token failed to verify. */
export const CAPTCHA_MESSAGES: Record<CaptchaFailure, string> = {
  missing: 'Please answer the verification question.',
  malformed: "We couldn't verify the form. Please try again.",
  expired: 'Verification expired. A new question has been generated.',
  incorrect: 'Incorrect verification answer. Please try again.',
};
