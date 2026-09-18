import { Prisma } from '@prisma/client';

export type DecimalLike = Prisma.Decimal | string | number | null | undefined;

/** Parse arbitrary form input into a Prisma Decimal. Never uses float maths. */
export function toDecimal(value: unknown): Prisma.Decimal | null {
  if (value === null || value === undefined || value === '') return null;
  const raw = typeof value === 'string' ? value.replace(/[,\s]/g, '') : value;
  try {
    const d = new Prisma.Decimal(raw as string | number);
    if (!d.isFinite()) return null;
    return d;
  } catch {
    return null;
  }
}

/** Decimal → plain string, safe to pass across the server/client boundary. */
export function decimalToString(value: DecimalLike): string | null {
  if (value === null || value === undefined) return null;
  return value.toString();
}

const CURRENCY_LOCALE: Record<string, string> = {
  INR: 'en-IN',
  USD: 'en-US',
  EUR: 'de-DE',
  GBP: 'en-GB',
  AED: 'en-AE',
  SAR: 'en-SA',
  QAR: 'en-QA',
  OMR: 'en-OM',
  KWD: 'en-KW',
  BHD: 'en-BH',
  SGD: 'en-SG',
  AUD: 'en-AU',
};

export function formatMoney(
  value: DecimalLike,
  currency = 'INR',
  options: { maximumFractionDigits?: number } = {},
): string {
  if (value === null || value === undefined || value === '') return '—';
  const asNumber = Number(value.toString());
  if (!Number.isFinite(asNumber)) return '—';
  const locale = CURRENCY_LOCALE[currency] ?? 'en-US';
  const hasFraction = asNumber % 1 !== 0;
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: hasFraction ? 2 : 0,
    maximumFractionDigits: options.maximumFractionDigits ?? (hasFraction ? 2 : 0),
  }).format(asNumber);
}

export const SUPPORTED_CURRENCIES = [
  'INR',
  'USD',
  'EUR',
  'GBP',
  'AED',
  'SAR',
  'QAR',
  'OMR',
  'KWD',
  'BHD',
  'SGD',
  'AUD',
] as const;
