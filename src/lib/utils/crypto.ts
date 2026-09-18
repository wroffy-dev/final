import 'server-only';
import crypto from 'node:crypto';

const ALGO = 'aes-256-gcm';

function key(): Buffer {
  const raw = process.env.ENCRYPTION_KEY || process.env.AUTH_SECRET || '';
  if (!raw) throw new Error('ENCRYPTION_KEY (or AUTH_SECRET) must be set to store secrets');
  // Normalise any length of input into a 32-byte key.
  return crypto.createHash('sha256').update(raw).digest();
}

/** Encrypts a secret for storage at rest. Output: enc:v1:<iv>:<tag>:<data> */
export function encryptSecret(plain: string): string {
  if (!plain) return '';
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, key(), iv);
  const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `enc:v1:${iv.toString('base64')}:${tag.toString('base64')}:${data.toString('base64')}`;
}

export function decryptSecret(stored: string | null | undefined): string {
  if (!stored) return '';
  if (!stored.startsWith('enc:v1:')) return stored; // legacy/plain value
  const [, , ivB64, tagB64, dataB64] = stored.split(':');
  if (!ivB64 || !tagB64 || !dataB64) return '';
  try {
    const decipher = crypto.createDecipheriv(ALGO, key(), Buffer.from(ivB64, 'base64'));
    decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
    return Buffer.concat([
      decipher.update(Buffer.from(dataB64, 'base64')),
      decipher.final(),
    ]).toString('utf8');
  } catch {
    return '';
  }
}

/** One-way, salted hash of an IP address — enough for rate limiting and dedupe. */
export function hashIp(ip: string | null | undefined): string | null {
  if (!ip) return null;
  const salt = process.env.AUTH_SECRET ?? 'salt';
  return crypto.createHash('sha256').update(`${salt}:${ip}`).digest('hex').slice(0, 32);
}

export function randomToken(bytes = 32): string {
  return crypto.randomBytes(bytes).toString('hex');
}
