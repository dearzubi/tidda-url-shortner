import type { LocalTokenBucketPolicy } from './rate-limit.policy-schema';
import type { ConsumeRateLimitInput, RateLimitDecision, RateLimitStore } from './rate-limit.types';

export const LOCAL_BUCKET_CLEANUP_INTERVAL_MS = 60_000;

type LocalBucketState = {
  tokens: number;
  lastRefillAtMs: number;
  expiresAtMs: number;
};

type NowProvider = () => number;

export class LocalTokenBucketStore implements RateLimitStore {
  private readonly buckets = new Map<string, LocalBucketState>();
  private nextCleanupAtMs = 0;

  constructor(private readonly now: NowProvider = Date.now) {}

  async consume(input: ConsumeRateLimitInput): Promise<RateLimitDecision> {
    const policy = input.policy.fallback;
    const nowMs = this.now();
    const key = `${input.policyName}:${input.identity.kind}:${input.identity.value}`;
    const current = this.getBucket(key, nowMs, policy);
    const elapsedMs = Math.max(0, nowMs - current.lastRefillAtMs);
    const refilledTokens = (elapsedMs * policy.refillTokens) / policy.refillIntervalMs;
    const tokens = Math.min(policy.capacity, current.tokens + refilledTokens);
    const allowed = tokens >= policy.cost;
    const remainingTokens = allowed ? tokens - policy.cost : tokens;
    const resetAfterMs =
      remainingTokens >= policy.cost
        ? 0
        : Math.ceil(
            ((policy.cost - remainingTokens) * policy.refillIntervalMs) / policy.refillTokens,
          );
    const retryAfterMs = allowed ? 0 : resetAfterMs;

    this.buckets.set(key, {
      tokens: remainingTokens,
      lastRefillAtMs: nowMs,
      expiresAtMs: nowMs + policy.keyTtlMs,
    });
    this.removeExpiredBucketsIfDue(nowMs);

    return {
      allowed,
      limit: policy.capacity,
      remaining: Math.max(0, Math.floor(remainingTokens)),
      retryAfterSeconds: Math.ceil(retryAfterMs / 1000),
      resetAtEpochSeconds: Math.floor((nowMs + resetAfterMs) / 1000),
      store: 'local_fallback',
    };
  }

  bucketCount(): number {
    return this.buckets.size;
  }

  private getBucket(key: string, nowMs: number, policy: LocalTokenBucketPolicy): LocalBucketState {
    const existing = this.buckets.get(key);
    if (existing && existing.expiresAtMs > nowMs) {
      return existing;
    }

    return {
      tokens: policy.capacity,
      lastRefillAtMs: nowMs,
      expiresAtMs: nowMs + policy.keyTtlMs,
    };
  }

  private removeExpiredBucketsIfDue(nowMs: number): void {
    if (nowMs < this.nextCleanupAtMs) {
      return;
    }

    this.nextCleanupAtMs = nowMs + LOCAL_BUCKET_CLEANUP_INTERVAL_MS;

    for (const [key, bucket] of this.buckets.entries()) {
      if (bucket.expiresAtMs <= nowMs) {
        this.buckets.delete(key);
      }
    }
  }
}
