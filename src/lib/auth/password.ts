import bcrypt from 'bcryptjs';

const ROUNDS = 12;

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, ROUNDS);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  if (!hash) return false;
  return bcrypt.compare(plain, hash);
}

/** Minimum policy enforced everywhere a password is set. */
export function passwordIssues(plain: string): string[] {
  const issues: string[] = [];
  if (plain.length < 10) issues.push('must be at least 10 characters');
  if (!/[a-z]/.test(plain)) issues.push('must contain a lowercase letter');
  if (!/[A-Z]/.test(plain)) issues.push('must contain an uppercase letter');
  if (!/[0-9]/.test(plain)) issues.push('must contain a number');
  return issues;
}
