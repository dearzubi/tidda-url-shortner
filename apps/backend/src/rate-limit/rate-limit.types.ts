export type TokenBucketPolicy = {
  capacity: number;
  refillTokens: number;
  refillIntervalMs: number;
  cost: number;
  redisKeyTtlMs: number;
  fallback: LocalTokenBucketPolicy;
};

export type LocalTokenBucketPolicy = {
  capacity: number;
  refillTokens: number;
  refillIntervalMs: number;
  cost: number;
  keyTtlMs: number;
};

export type RateLimitIdentity = {
  kind: 'ip';
  value: string;
};

export type RateLimitDecision = {
  allowed: boolean;
  limit: number;
  remaining: number;
  retryAfterSeconds: number;
  resetAtEpochSeconds: number;
  store: 'redis' | 'local_fallback';
};

export type ConsumeRateLimitInput = {
  policyName: string;
  policy: TokenBucketPolicy;
  identity: RateLimitIdentity;
};

export type RateLimitStore = {
  consume(input: ConsumeRateLimitInput): Promise<RateLimitDecision>;
};
