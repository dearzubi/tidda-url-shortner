import { z } from 'zod';

export const LocalTokenBucketPolicySchema = z
  .object({
    capacity: z.number().int().positive(),
    refillTokens: z.number().int().positive(),
    refillIntervalMs: z.number().int().positive(),
    cost: z.number().int().positive(),
    keyTtlMs: z.number().int().positive(),
  })
  .refine((policy) => policy.cost <= policy.capacity, {
    path: ['cost'],
    message: 'fallback cost must be less than or equal to fallback capacity',
  });

export const TokenBucketPolicySchema = z
  .object({
    capacity: z.number().int().positive(),
    refillTokens: z.number().int().positive(),
    refillIntervalMs: z.number().int().positive(),
    cost: z.number().int().positive(),
    redisKeyTtlMs: z.number().int().positive(),
    fallback: LocalTokenBucketPolicySchema,
  })
  .refine((policy) => policy.cost <= policy.capacity, {
    path: ['cost'],
    message: 'cost must be less than or equal to capacity',
  });

export const RateLimitPoliciesSchema = z.record(z.string().trim().min(1), TokenBucketPolicySchema);

export type LocalTokenBucketPolicy = z.infer<typeof LocalTokenBucketPolicySchema>;
export type TokenBucketPolicy = z.infer<typeof TokenBucketPolicySchema>;
