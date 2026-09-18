import 'server-only';
import { Secret, TOTP } from 'otpauth';
import QRCode from 'qrcode';

/**
 * RFC 6238 TOTP, via `otpauth`.
 *
 * No custom cryptography: the library does the HMAC, the counter arithmetic
 * and the constant-time comparison. The parameters below are the ones
 * Microsoft Authenticator, Google Authenticator, Authy and 1Password all
 * accept without configuration.
 */

export const TOTP_ALGORITHM = 'SHA1';
export const TOTP_DIGITS = 6;
export const TOTP_PERIOD = 30;
/** ±1 step, so a code still works across a 30s boundary or mild clock drift. */
export const TOTP_WINDOW = 1;

export function mfaIssuer(): string {
  return process.env.MFA_ISSUER || 'Dropbox Reseller';
}

/** A fresh 160-bit secret, in the base32 form authenticator apps expect. */
export function generateTotpSecret(): string {
  return new Secret({ size: 20 }).base32;
}

function totp(secretBase32: string, label: string): TOTP {
  return new TOTP({
    issuer: mfaIssuer(),
    label,
    algorithm: TOTP_ALGORITHM,
    digits: TOTP_DIGITS,
    period: TOTP_PERIOD,
    secret: Secret.fromBase32(secretBase32),
  });
}

/**
 * otpauth:// URI for the QR code.
 *
 * The label is the account's email so a user with several accounts can tell
 * the entries apart inside the app.
 */
export function otpauthUri(secretBase32: string, accountLabel: string): string {
  return totp(secretBase32, accountLabel).toString();
}

/** PNG data URI. Rendered server-side so the secret never reaches a CDN. */
export async function qrCodeDataUri(uri: string): Promise<string> {
  return QRCode.toDataURL(uri, { errorCorrectionLevel: 'M', margin: 2, width: 240 });
}

/** Groups the base32 secret into fours for the "can't scan?" manual entry. */
export function formatSecretForDisplay(secretBase32: string): string {
  return secretBase32.replace(/(.{4})/g, '$1 ').trim();
}

export type TotpCheck =
  | { ok: true; step: number }
  | { ok: false };

/**
 * Validates a code and reports which time step matched.
 *
 * The step is what makes replay protection possible: the caller records the
 * highest step it has already accepted and refuses anything at or below it, so
 * a code observed in transit cannot be used again inside its own window.
 */
export function verifyTotp(secretBase32: string, token: string): TotpCheck {
  const cleaned = token.replace(/\D/g, '');
  if (cleaned.length !== TOTP_DIGITS) return { ok: false };

  let delta: number | null;
  try {
    delta = totp(secretBase32, 'verify').validate({ token: cleaned, window: TOTP_WINDOW });
  } catch {
    return { ok: false };
  }
  if (delta === null) return { ok: false };

  const currentStep = Math.floor(Date.now() / 1000 / TOTP_PERIOD);
  return { ok: true, step: currentStep + delta };
}
