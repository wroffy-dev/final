import { describe, it, expect } from 'vitest';
import { createCaptchaChallenge, verifyCaptcha, CAPTCHA_MESSAGES } from '@/lib/forms/captcha';

/** Recovers the answer the way a person would: by reading the question. */
function solve(question: string): number {
  const match = question.match(/What is (\d+) ([+−]) (\d+)\?/);
  if (!match) throw new Error(`unparseable question: ${question}`);
  const [, a, op, b] = match;
  return op === '+' ? Number(a) + Number(b) : Number(a) - Number(b);
}

describe('math captcha', () => {
  it('asks a question a person can answer, and never leaks the answer', () => {
    for (let i = 0; i < 200; i += 1) {
      const { question, token } = createCaptchaChallenge();
      expect(question).toMatch(/^What is \d+ [+−] \d+\?$/);

      const answer = solve(question);
      // No division, no decimals, no negatives.
      expect(Number.isInteger(answer)).toBe(true);
      expect(answer).toBeGreaterThanOrEqual(0);

      // The token must not contain the answer as its own field. Operands are
      // in there by design — they are already visible in the question.
      const [, a, b, operation] = token.split('.');
      expect(operation === 'add' || operation === 'sub').toBe(true);
      const expected = operation === 'add' ? Number(a) + Number(b) : Number(a) - Number(b);
      expect(expected).toBe(answer);
    }
  });

  it('accepts the correct answer', () => {
    const challenge = createCaptchaChallenge();
    expect(verifyCaptcha(challenge.token, solve(challenge.question))).toEqual({ ok: true });
    // Submitted as a string, which is how it arrives from a form.
    expect(verifyCaptcha(challenge.token, String(solve(challenge.question)))).toEqual({ ok: true });
    expect(verifyCaptcha(challenge.token, ` ${solve(challenge.question)} `)).toEqual({ ok: true });
  });

  it('rejects a wrong answer', () => {
    const challenge = createCaptchaChallenge();
    const correct = solve(challenge.question);
    expect(verifyCaptcha(challenge.token, correct + 1)).toEqual({ ok: false, reason: 'incorrect' });
    expect(verifyCaptcha(challenge.token, correct - 1)).toEqual({ ok: false, reason: 'incorrect' });
    expect(verifyCaptcha(challenge.token, 'seven')).toEqual({ ok: false, reason: 'incorrect' });
    expect(verifyCaptcha(challenge.token, '1.5')).toEqual({ ok: false, reason: 'incorrect' });
  });

  it('rejects a missing answer or a missing token', () => {
    const challenge = createCaptchaChallenge();
    for (const empty of [undefined, null, '', '   ']) {
      expect(verifyCaptcha(challenge.token, empty)).toEqual({ ok: false, reason: 'missing' });
    }
    for (const empty of [undefined, null, '', 123]) {
      expect(verifyCaptcha(empty, '5')).toEqual({ ok: false, reason: 'missing' });
    }
  });

  it('rejects an expired token', () => {
    const challenge = createCaptchaChallenge(5 * 60);
    const answer = solve(challenge.question);

    // Still good one second before the deadline.
    expect(verifyCaptcha(challenge.token, answer, Date.now() + 5 * 60 * 1000 - 1000)).toEqual({
      ok: true,
    });
    // Gone one second after it.
    expect(verifyCaptcha(challenge.token, answer, Date.now() + 5 * 60 * 1000 + 1000)).toEqual({
      ok: false,
      reason: 'expired',
    });
  });

  it('clamps the lifetime into the 5–15 minute band', () => {
    const now = Date.now();
    const tooShort = createCaptchaChallenge(1);
    const tooLong = createCaptchaChallenge(60 * 60);
    const expiry = (token: string) => Number(token.split('.')[4]) - now;

    expect(expiry(tooShort.token)).toBeGreaterThanOrEqual(5 * 60 * 1000 - 1000);
    expect(expiry(tooLong.token)).toBeLessThanOrEqual(15 * 60 * 1000 + 1000);
  });

  it('rejects a tampered token', () => {
    const challenge = createCaptchaChallenge();
    const [version, a, b, operation, expiry, signature] = challenge.token.split('.');
    const answer = solve(challenge.question);

    /*
     * Operands swapped for easier ones, signature left alone.
     *
     * They are derived from the real operand so the forgery is always a
     * forgery. Hard-coding `1 + 1` meant that roughly one run in 162 — when the
     * genuine challenge happened to be 1 + 1 — forged a token identical to the
     * real one, which verifies correctly and failed the test for the one reason
     * it is not testing.
     */
    const easy = Number(a) === 1 ? '2' : '1';
    const forgedOperands = [version, easy, easy, 'add', expiry, signature].join('.');
    expect(verifyCaptcha(forgedOperands, Number(easy) * 2)).toEqual({
      ok: false,
      reason: 'malformed',
    });

    // Expiry pushed into the far future.
    const forgedExpiry = [version, a, b, operation, String(Date.now() + 10 ** 9), signature].join(
      '.',
    );
    expect(verifyCaptcha(forgedExpiry, answer)).toEqual({ ok: false, reason: 'malformed' });

    // Signature replaced.
    const forgedSignature = [version, a, b, operation, expiry, 'not-a-real-signature'].join('.');
    expect(verifyCaptcha(forgedSignature, answer)).toEqual({ ok: false, reason: 'malformed' });

    // Signature of the right length but wrong content, so the constant-time
    // compare is actually exercised rather than short-circuited on length.
    const sameLength = signature.slice(0, -1) + (signature.endsWith('A') ? 'B' : 'A');
    expect(verifyCaptcha([version, a, b, operation, expiry, sameLength].join('.'), answer)).toEqual(
      {
        ok: false,
        reason: 'malformed',
      },
    );

    // Structurally wrong tokens.
    for (const junk of ['', 'x', 'a.b.c', 'c1.1.1.add.1.2.3', 'c2.1.1.add.9999999999999.sig']) {
      const result = verifyCaptcha(junk, answer);
      expect(result.ok).toBe(false);
    }
  });

  it('produces varied challenges rather than one repeated question', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 100; i += 1) seen.add(createCaptchaChallenge().question);
    expect(seen.size).toBeGreaterThan(5);
  });

  it('gives the visitor a plain message for every failure, leaking nothing', () => {
    expect(CAPTCHA_MESSAGES.expired).toBe(
      'Verification expired. A new question has been generated.',
    );
    expect(CAPTCHA_MESSAGES.incorrect).toBe('Incorrect verification answer. Please try again.');
    expect(CAPTCHA_MESSAGES.malformed).toBe("We couldn't verify the form. Please try again.");

    for (const message of Object.values(CAPTCHA_MESSAGES)) {
      expect(message).not.toMatch(/signature|hmac|token|secret|hash/i);
    }
  });
});
