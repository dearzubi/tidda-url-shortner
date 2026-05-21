import { describe, expect, it } from 'vitest';
import {
  LOCAL_BUCKET_CLEANUP_INTERVAL_MS,
  LocalTokenBucketStore,
} from './local-token-bucket.store';
import type { ConsumeRateLimitInput, TokenBucketPolicy } from './rate-limit.types';

const POLICY_NAME = 'test.local';

function createTestPolicy(): TokenBucketPolicy {
  return {
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
  };
}

describe('LocalTokenBucketStore', () => {
  it('allows requests while fallback tokens remain', async () => {
    const store = new LocalTokenBucketStore(() => 1_000);
    const policy = createTestPolicy();

    const first = await store.consume({
      policyName: POLICY_NAME,
      policy,
      identity: { kind: 'ip', value: '203.0.113.10' },
    });
    const second = await store.consume({
      policyName: POLICY_NAME,
      policy,
      identity: { kind: 'ip', value: '203.0.113.10' },
    });

    expect(first.allowed).toBe(true);
    expect(first.remaining).toBe(1);
    expect(second.allowed).toBe(true);
    expect(second.remaining).toBe(0);
  });

  it('rejects when fallback tokens are exhausted', async () => {
    const store = new LocalTokenBucketStore(() => 1_000);
    const policy = createTestPolicy();
    const input: ConsumeRateLimitInput = {
      policyName: POLICY_NAME,
      policy,
      identity: { kind: 'ip', value: '203.0.113.10' },
    };

    await store.consume(input);
    await store.consume(input);
    const third = await store.consume(input);

    expect(third).toEqual({
      allowed: false,
      limit: 2,
      remaining: 0,
      retryAfterSeconds: 30,
      resetAtEpochSeconds: 31,
      store: 'local_fallback',
    });
  });

  it('refills tokens over time', async () => {
    let nowMs = 1_000;
    const store = new LocalTokenBucketStore(() => nowMs);
    const policy = createTestPolicy();
    const input: ConsumeRateLimitInput = {
      policyName: POLICY_NAME,
      policy,
      identity: { kind: 'ip', value: '203.0.113.10' },
    };

    await store.consume(input);
    await store.consume(input);

    nowMs = 31_000;
    const afterRefill = await store.consume(input);

    expect(afterRefill.allowed).toBe(true);
    expect(afterRefill.remaining).toBe(0);
  });

  it('reports reset time after consuming the last token', async () => {
    const store = new LocalTokenBucketStore(() => 1_000);
    const policy = createTestPolicy();
    const input: ConsumeRateLimitInput = {
      policyName: POLICY_NAME,
      policy,
      identity: { kind: 'ip', value: '203.0.113.10' },
    };

    await store.consume(input);
    const second = await store.consume(input);

    expect(second.allowed).toBe(true);
    expect(second.remaining).toBe(0);
    expect(second.retryAfterSeconds).toBe(0);
    expect(second.resetAtEpochSeconds).toBe(31);
  });

  it('keeps separate buckets per identity', async () => {
    const store = new LocalTokenBucketStore(() => 1_000);
    const policy = createTestPolicy();

    await store.consume({
      policyName: POLICY_NAME,
      policy,
      identity: { kind: 'ip', value: '203.0.113.10' },
    });
    await store.consume({
      policyName: POLICY_NAME,
      policy,
      identity: { kind: 'ip', value: '203.0.113.10' },
    });
    const otherIp = await store.consume({
      policyName: POLICY_NAME,
      policy,
      identity: { kind: 'ip', value: '203.0.113.11' },
    });

    expect(otherIp.allowed).toBe(true);
    expect(otherIp.remaining).toBe(1);
  });

  it('does not scan expired buckets on every consume call', async () => {
    let nowMs = 1_000;
    const store = new LocalTokenBucketStore(() => nowMs);
    const policy = createTestPolicy();

    await store.consume({
      policyName: POLICY_NAME,
      policy,
      identity: { kind: 'ip', value: '203.0.113.10' },
    });

    nowMs = 2_000;
    await store.consume({
      policyName: POLICY_NAME,
      policy,
      identity: { kind: 'ip', value: '203.0.113.11' },
    });

    expect(store.bucketCount()).toBe(2);
  });

  it('periodically removes expired idle buckets', async () => {
    let nowMs = 1_000;
    const store = new LocalTokenBucketStore(() => nowMs);
    const basePolicy = createTestPolicy();
    const policy = {
      ...basePolicy,
      fallback: {
        ...basePolicy.fallback,
        keyTtlMs: 1_000,
      },
    };

    await store.consume({
      policyName: POLICY_NAME,
      policy,
      identity: { kind: 'ip', value: '203.0.113.10' },
    });

    nowMs = 1_000 + LOCAL_BUCKET_CLEANUP_INTERVAL_MS + 1_000;
    await store.consume({
      policyName: POLICY_NAME,
      policy,
      identity: { kind: 'ip', value: '203.0.113.11' },
    });

    expect(store.bucketCount()).toBe(1);
  });
});
