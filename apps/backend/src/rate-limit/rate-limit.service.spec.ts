import { describe, expect, it, vi } from 'vitest';
import { LocalTokenBucketStore } from './local-token-bucket.store';
import { RateLimitService } from './rate-limit.service';
import type { RateLimitStore } from './rate-limit.types';

describe('RateLimitService', () => {
  it('returns the Redis decision when Redis succeeds', async () => {
    const redis: RateLimitStore = {
      consume: vi.fn().mockResolvedValue({
        allowed: true,
        limit: 10,
        remaining: 9,
        retryAfterSeconds: 0,
        resetAtEpochSeconds: 1_771_524_477,
        store: 'redis',
      }),
    };
    const local = new LocalTokenBucketStore(() => 1_000);
    const logger = { setContext: vi.fn(), warn: vi.fn() };
    const service = new RateLimitService(redis, local, logger);

    const decision = await service.consume({
      policyName: 'links.create.anonymous',
      identity: { kind: 'ip', value: '203.0.113.10' },
    });

    expect(decision.store).toBe('redis');
    expect(decision.remaining).toBe(9);
  });

  it('uses local fallback when Redis fails', async () => {
    const redis: RateLimitStore = {
      consume: vi.fn().mockRejectedValue(new Error('redis down')),
    };
    const local = new LocalTokenBucketStore(() => 1_000);
    const logger = { setContext: vi.fn(), warn: vi.fn() };
    const service = new RateLimitService(redis, local, logger);

    const decision = await service.consume({
      policyName: 'links.create.anonymous',
      identity: { kind: 'ip', value: '203.0.113.10' },
    });

    expect(decision.store).toBe('local_fallback');
    expect(decision.limit).toBe(2);
    expect(decision.remaining).toBe(1);
    expect(logger.warn).toHaveBeenCalledWith(
      { err: expect.any(Error), policy: 'links.create.anonymous' },
      'rate limit Redis store failed',
    );
  });
});
