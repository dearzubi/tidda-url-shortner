import { parseSchema } from '@tidda/shared';
import { RateLimitPoliciesSchema, type TokenBucketPolicy } from './rate-limit.policy-schema';

const RATE_LIMIT_POLICY_DEFINITIONS = {
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
};

export function parseRateLimitPolicies(source: unknown): Record<string, TokenBucketPolicy> {
  return parseSchema(RateLimitPoliciesSchema, source, 'Invalid rate-limit policies');
}

export const RATE_LIMIT_POLICIES = parseRateLimitPolicies(RATE_LIMIT_POLICY_DEFINITIONS);

export type RateLimitPolicyName = keyof typeof RATE_LIMIT_POLICY_DEFINITIONS;

export function getRateLimitPolicy(name: RateLimitPolicyName): TokenBucketPolicy {
  const policy = RATE_LIMIT_POLICIES[name];
  if (!policy) {
    throw new Error(`Unknown rate-limit policy: ${name}`);
  }

  return policy;
}
