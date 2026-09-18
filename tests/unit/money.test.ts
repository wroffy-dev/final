import { describe, it, expect } from 'vitest';
import { Prisma } from '@prisma/client';
import { toDecimal, decimalToString, formatMoney } from '@/lib/utils/money';

describe('money', () => {
  it('parses strings into Decimal without float error', () => {
    const value = toDecimal('1250.10');
    expect(value).toBeInstanceOf(Prisma.Decimal);
    expect(value!.toString()).toBe('1250.1');
  });

  it('keeps precision that a float would lose', () => {
    // 0.1 + 0.2 === 0.30000000000000004 in float arithmetic.
    const sum = toDecimal('0.1')!.plus(toDecimal('0.2')!);
    expect(sum.toString()).toBe('0.3');
  });

  it('strips thousands separators', () => {
    expect(toDecimal('1,250,000.50')!.toString()).toBe('1250000.5');
  });

  it('returns null for blanks and nonsense', () => {
    expect(toDecimal('')).toBeNull();
    expect(toDecimal(null)).toBeNull();
    expect(toDecimal(undefined)).toBeNull();
    expect(toDecimal('not a number')).toBeNull();
  });

  it('round-trips a Decimal to a client-safe string', () => {
    expect(decimalToString(new Prisma.Decimal('19900.00'))).toBe('19900');
    expect(decimalToString(null)).toBeNull();
  });

  it('formats currency without introducing float drift', () => {
    expect(formatMoney('1250', 'INR')).toContain('1,250');
    expect(formatMoney('1250.75', 'USD')).toContain('1,250.75');
    expect(formatMoney(null)).toBe('—');
  });
});
