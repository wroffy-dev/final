import 'server-only';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { pipeline } from 'node:stream/promises';
import type { Readable } from 'node:stream';

/**
 * SHA-256 over an archive.
 *
 * Always streamed: a backup can be several gigabytes, and reading one into a
 * Buffer to hash it would defeat the point of streaming everywhere else.
 */
export async function checksumFile(filePath: string): Promise<string> {
  return checksumStream(fs.createReadStream(filePath));
}

export async function checksumStream(input: Readable): Promise<string> {
  const hash = crypto.createHash('sha256');
  await pipeline(input, hash);
  return hash.digest('hex');
}

/**
 * Constant-time comparison of two checksums.
 *
 * A plain `===` would leak position information through timing. That matters
 * little here, but integrity checks are exactly the place not to be sloppy.
 */
export function checksumMatches(expected: string, actual: string): boolean {
  if (typeof expected !== 'string' || typeof actual !== 'string') return false;
  if (expected.length !== actual.length || expected.length === 0) return false;
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(actual));
}

export const CHECKSUM_FAILED_MESSAGE = 'Backup integrity verification failed.';
