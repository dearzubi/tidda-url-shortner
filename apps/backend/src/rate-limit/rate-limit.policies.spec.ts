import { describe, expect, it } from 'vitest';
import { getRateLimitPolicy, RATE_LIMIT_POLICIES } from './rate-limit.policies';

describe('rate-limit policies', () => {
  it('defines the anonymous link creation policy', () => {
    expect(RATE_LIMIT_POLICIES['links.create.anonymous']).toEqual({
      capacity: 10,
      refillTokens: 10,
      refillIntervalMs: 60_000,
      cost: 1,
      redisKeyTtlMs: 180_000,
      fallback: {
        capacity: 2,
        refillTokens: 2,
        refillIntervalMs: 60_000,
        cost: 1,
        keyTtlMs: 180_000,
      },
    });
  });

  it('returns a named policy', () => {
    expect(getRateLimitPolicy('links.create.anonymous').capacity).toBe(10);
  });
});
