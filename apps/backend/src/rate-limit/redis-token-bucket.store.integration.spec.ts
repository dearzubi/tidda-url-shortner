import { createHash } from 'node:crypto';
import { RedisContainer, type StartedRedisContainer } from '@testcontainers/redis';
import { createClient } from 'redis';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { TokenBucketPolicy } from './rate-limit.policy-schema';
import type { ConsumeRateLimitInput } from './rate-limit.types';
import { REDIS_TOKEN_BUCKET_SCRIPT } from './redis-token-bucket.script';
import {
  type RedisClientProvider,
  type RedisTokenBucketClient,
  RedisTokenBucketStore,
} from './redis-token-bucket.store';
import { RedisTokenBucketScriptLoader } from './redis-token-bucket-script.loader';

type ConnectableRedisTokenBucketClient = RedisTokenBucketClient & {
  readonly isOpen: boolean;
  connect(): Promise<unknown>;
};

const POLICY_NAME = 'test.redis';

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

function createClientProvider(client: ConnectableRedisTokenBucketClient): RedisClientProvider {
  let connectPromise: Promise<void> | undefined;

  return {
    async getOpenClient() {
      if (!client.isOpen) {
        connectPromise ??= client
          .connect()
          .then(() => undefined)
          .finally(() => {
            connectPromise = undefined;
          });
        await connectPromise;
      }

      return client;
    },
  };
}

describe('RedisTokenBucketStore', () => {
  let container: StartedRedisContainer;
  let client: ReturnType<typeof createClient>;
  let store: RedisTokenBucketStore;
  let loader: RedisTokenBucketScriptLoader;

  beforeAll(async () => {
    container = await new RedisContainer('redis:8.6.3-alpine').start();
    client = createClient({ url: container.getConnectionUrl() });
    await client.connect();
  });

  afterAll(async () => {
    client.destroy();
    await container.stop();
  });

  beforeEach(async () => {
    await client.flushDb();
    const provider = createClientProvider(client);
    loader = new RedisTokenBucketScriptLoader(provider);
    await loader.onModuleInit();
    store = new RedisTokenBucketStore(provider, loader);
  });

  it('loads the Lua script into Redis during module initialisation', async () => {
    const sha = createHash('sha1').update(REDIS_TOKEN_BUCKET_SCRIPT).digest('hex');

    await expect(client.scriptExists(sha)).resolves.toEqual([1]);
  });

  it('allows requests while Redis tokens remain', async () => {
    const policy = createTestPolicy();
    const input: ConsumeRateLimitInput = {
      policyName: POLICY_NAME,
      policy,
      identity: { kind: 'ip', value: '203.0.113.10' },
    };

    const first = await store.consume(input);
    const second = await store.consume(input);

    expect(first.allowed).toBe(true);
    expect(first.limit).toBe(policy.capacity);
    expect(first.remaining).toBe(policy.capacity - policy.cost);
    expect(first.store).toBe('redis');
    expect(second.allowed).toBe(true);
    expect(second.remaining).toBe(policy.capacity - policy.cost * 2);
  });

  it('rejects when Redis tokens are exhausted', async () => {
    const policy = createTestPolicy();
    const input: ConsumeRateLimitInput = {
      policyName: POLICY_NAME,
      policy,
      identity: { kind: 'ip', value: '203.0.113.10' },
    };

    for (let i = 0; i < policy.capacity; i += 1) {
      await store.consume(input);
    }

    const limited = await store.consume(input);

    expect(limited.allowed).toBe(false);
    expect(limited.limit).toBe(policy.capacity);
    expect(limited.remaining).toBe(0);
    expect(limited.retryAfterSeconds).toBeGreaterThan(0);
    expect(limited.resetAtEpochSeconds).toBeGreaterThan(Math.floor(Date.now() / 1000));
  });

  it('reports reset time after consuming the last Redis token', async () => {
    const policy = {
      ...createTestPolicy(),
      capacity: 2,
      refillTokens: 2,
    };
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
    expect(second.resetAtEpochSeconds).toBeGreaterThan(Math.floor(Date.now() / 1000));
  });

  it('sets an idle expiry on bucket keys', async () => {
    const policy = { ...createTestPolicy(), redisKeyTtlMs: 5_000 };

    await store.consume({
      policyName: POLICY_NAME,
      policy,
      identity: { kind: 'ip', value: '203.0.113.10' },
    });

    const key = `rate-limit:${POLICY_NAME}:ip:203.0.113.10`;
    const ttl = await client.pTTL(key);

    expect(ttl).not.toBe(-1);
    expect(ttl).not.toBe(-2);
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(policy.redisKeyTtlMs);
  });

  it('reloads the Lua script and retries once when Redis no longer has the cached script', async () => {
    const policy = createTestPolicy();
    await client.scriptFlush();

    const decision = await store.consume({
      policyName: POLICY_NAME,
      policy,
      identity: { kind: 'ip', value: '203.0.113.10' },
    });

    expect(decision.allowed).toBe(true);
    expect(decision.store).toBe('redis');
    const sha = createHash('sha1').update(REDIS_TOKEN_BUCKET_SCRIPT).digest('hex');
    await expect(client.scriptExists(sha)).resolves.toEqual([1]);
  });

  it('makes same-key decisions atomically across Redis clients', async () => {
    const policy = createTestPolicy();
    const input: ConsumeRateLimitInput = {
      policyName: POLICY_NAME,
      policy,
      identity: { kind: 'ip', value: '203.0.113.10' },
    };

    const clients = await Promise.all(
      Array.from({ length: 4 }, async () => {
        const client = createClient({ url: container.getConnectionUrl() });
        await client.connect();
        return client;
      }),
    );

    try {
      const stores = clients.map(
        (client) => new RedisTokenBucketStore(createClientProvider(client), loader),
      );
      const decisions = await Promise.all(
        Array.from({ length: policy.capacity * 2 }, (_, index) => {
          const store = stores[index % stores.length];
          if (!store) {
            throw new Error('Missing Redis token bucket store');
          }

          return store.consume(input);
        }),
      );

      expect(decisions.filter((decision) => decision.allowed)).toHaveLength(policy.capacity);
      expect(decisions.filter((decision) => !decision.allowed)).toHaveLength(policy.capacity);
      expect(decisions.every((decision) => decision.store === 'redis')).toBe(true);
    } finally {
      for (const client of clients) {
        client.destroy();
      }
    }
  });
});
