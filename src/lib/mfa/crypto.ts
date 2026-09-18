import 'server-only';
import crypto from 'node:crypto';

/**
 * Encryption for TOTP secrets and recovery codes.
 *
 * Kept separate from `@/lib/utils/crypto` on purpose. That helper falls back to
 * AUTH_SECRET, which is convenient for CMS settings but wrong here: rotating
 * AUTH_SECRET to invalidate sessions would silently make every authenticator
 * in the company stop working. MFA gets its own key with its own lifecycle.
 *
 * Nothing in this file ever logs, returns or throws a value derived from the
 * key or the plaintext.
 */

const ALGO = 'aes-256-gcm';
const PREFIX = 'mfa:v1';

function keyMaterial(): string {
  const raw = process.env.MFA_ENCRYPTION_KEY || process.env.ENCRYPTION_KEY || process.env.AUTH_SECRET;
  if (!raw) {
    throw new Error('MFA_ENCRYPTION_KEY must be set before two-factor authentication can be used.');
  }
  if (raw.length < 32) {
    throw new Error('MFA_ENCRYPTION_KEY must be at least 32 characters.');
  }
  return raw;
}

/** Any key length is folded into the 32 bytes AES-256 needs. */
function encryptionKey(): Buffer {
  return crypto.createHash('sha256').update(keyMaterial()).digest();
}

/** Separate derivation, so the HMAC pepper is not the encryption key itself. */
function hmacKey(): Buffer {
  return crypto.createHash('sha256').update(`recovery:${keyMaterial()}`).digest();
}

/** True when the deployment is configured well enough to enrol anyone. */
export function mfaKeyConfigured(): boolean {
  try {
    keyMaterial();
    return true;
  } catch {
    return false;
  }
}

/** Packs iv, auth tag and ciphertext into one opaque column value. */
export function encryptTotpSecret(plain: string): string {
  if (!plain) throw new Error('Refusing to encrypt an empty secret.');
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, encryptionKey(), iv);
  const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [PREFIX, iv.toString('base64'), tag.toString('base64'), data.toString('base64')].join(':');
}

/**
 * Returns null rather than throwing on anything unreadable — a wrong key, a
 * truncated column, a value from a restore taken against a different key. The
 * caller treats null as "this user must re-enrol", which is the only safe
 * response and never leaks why.
 */
export function decryptTotpSecret(stored: string | null | undefined): string | null {
  if (!stored || !stored.startsWith(`${PREFIX}:`)) return null;
  // The prefix itself contains a colon ("mfa:v1"), so the payload starts at
  // index 2, not 1.
  const [, , ivB64, tagB64, dataB64] = stored.split(':');
  if (!ivB64 || !tagB64 || !dataB64) return null;
  try {
    const decipher = crypto.createDecipheriv(ALGO, encryptionKey(), Buffer.from(ivB64, 'base64'));
    decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
    const plain = Buffer.concat([
      decipher.update(Buffer.from(dataB64, 'base64')),
      decipher.final(),
    ]).toString('utf8');
    return plain || null;
  } catch {
    return null;
  }
}

/**
 * Keyed digest of a recovery code.
 *
 * HMAC rather than a bare SHA-256: recovery codes carry ~60 bits of entropy,
 * which is within reach of an offline attack on a leaked table. Keying the
 * digest with a secret the database does not contain makes a database dump on
 * its own useless. Deterministic, so a code can be looked up by index instead
 * of compared against every row.
 */
export function hashRecoveryCode(code: string): string {
  return crypto.createHmac('sha256', hmacKey()).update(normaliseRecoveryCode(code)).digest('hex');
}

/** Accepts what a user actually types: spaces, lower case, missing dashes. */
export function normaliseRecoveryCode(code: string): string {
  return code.toUpperCase().replace(/[^A-Z0-9]/g, '');
}
