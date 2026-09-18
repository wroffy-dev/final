import { describe, it, expect, beforeEach } from 'vitest';
import { rateLimit, __resetRateLimits } from '@/lib/utils/rate-limit';

describe('rateLimit', () => {
  beforeEach(() => __resetRateLimits());

  it('allows requests up to the limit', () => {
    for (let i = 0; i < 3; i += 1) {
      expect(rateLimit('key', 3, 60).ok).toBe(true);
    }
  });

  it('blocks the request after the limit and reports a retry delay', () => {
    for (let i = 0; i < 3; i += 1) rateLimit('key', 3, 60);
    const blocked = rateLimit('key', 3, 60);
    expect(blocked.ok).toBe(false);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
  });

  it('tracks keys independently', () => {
    for (let i = 0; i < 3; i += 1) rateLimit('a', 3, 60);
    expect(rateLimit('a', 3, 60).ok).toBe(false);
    expect(rateLimit('b', 3, 60).ok).toBe(true);
  });
});
