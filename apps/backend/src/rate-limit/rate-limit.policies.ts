import type { TokenBucketPolicy } from './rate-limit.types';

export const RATE_LIMIT_POLICIES = {
  'links.create.anonymous': {
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
  },
} satisfies Record<string, TokenBucketPolicy>;

export type RateLimitPolicyName = keyof typeof RATE_LIMIT_POLICIES;

export function getRateLimitPolicy(name: RateLimitPolicyName): TokenBucketPolicy {
  return RATE_LIMIT_POLICIES[name];
}
