import { describe, expect, it } from 'vitest';
import {
  getRateLimitPolicy,
  parseRateLimitPolicies,
  RATE_LIMIT_POLICIES,
} from './rate-limit.policies';
import type { TokenBucketPolicy } from './rate-limit.policy-schema';

describe('rate-limit policies', () => {
  it('defines the anonymous link creation policy', () => {
    const expectedPolicy = {
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
    } satisfies TokenBucketPolicy;
    expect(RATE_LIMIT_POLICIES['links.create.anonymous']).toEqual(expectedPolicy);
  });

  it('returns a named policy', () => {
    expect(getRateLimitPolicy('links.create.anonymous').capacity).toBe(10);
  });

  it.each([
    ['capacity', { capacity: 0 }],
    ['refillTokens', { refillTokens: 0 }],
    ['refillIntervalMs', { refillIntervalMs: 0 }],
    ['cost', { cost: 0 }],
    ['redisKeyTtlMs', { redisKeyTtlMs: 0 }],
    ['fallback.capacity', { fallback: { capacity: 0 } }],
    ['fallback.refillTokens', { fallback: { refillTokens: 0 } }],
    ['fallback.refillIntervalMs', { fallback: { refillIntervalMs: 0 } }],
    ['fallback.cost', { fallback: { cost: 0 } }],
    ['fallback.keyTtlMs', { fallback: { keyTtlMs: 0 } }],
  ])('rejects non-positive %s values', (_field, override) => {
    expect(() => parseRateLimitPolicies({ test: createPolicy(override) })).toThrow(
      /Invalid rate-limit policies/,
    );
  });

  it('rejects policies where cost is greater than capacity', () => {
    expect(() => parseRateLimitPolicies({ test: createPolicy({ capacity: 1, cost: 2 }) })).toThrow(
      /Invalid rate-limit policies/,
    );
  });

  it('rejects fallback policies where cost is greater than capacity', () => {
    expect(() =>
      parseRateLimitPolicies({
        test: createPolicy({ fallback: { capacity: 1, cost: 2 } }),
      }),
    ).toThrow(/Invalid rate-limit policies/);
  });
});

type PolicyOverride = Partial<Omit<TokenBucketPolicy, 'fallback'>> & {
  fallback?: Partial<TokenBucketPolicy['fallback']>;
};

function createPolicy(override: PolicyOverride = {}): TokenBucketPolicy {
  return {
    capacity: 10,
    refillTokens: 10,
    refillIntervalMs: 60_000,
    cost: 1,
    redisKeyTtlMs: 180_000,
    ...override,
    fallback: {
      capacity: 2,
      refillTokens: 2,
      refillIntervalMs: 60_000,
      cost: 1,
      keyTtlMs: 180_000,
      ...override.fallback,
    },
  } satisfies TokenBucketPolicy;
}
