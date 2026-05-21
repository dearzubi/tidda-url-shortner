import { parseSchema } from '@tidda/shared';
import { z } from 'zod';
import type { ConsumeRateLimitInput, RateLimitDecision, RateLimitStore } from './rate-limit.types';
import {
  type RedisScriptLoaderClient,
  RedisTokenBucketScriptLoader,
} from './redis-token-bucket-script.loader';

export type RedisTokenBucketClient = RedisScriptLoaderClient & {
  evalSha(sha: string, options: { keys: string[]; arguments: string[] }): Promise<unknown>;
};

export type RedisClientProvider = {
  getOpenClient(): Promise<RedisTokenBucketClient>;
};

const RedisDecisionSchema = z.tuple([
  // allowed
  z.union([z.literal(0), z.literal(1)]),
  // remaining
  z.number().int().min(0),
  // retryAfterSeconds
  z.number().int().min(0),
  // resetAtEpochSeconds
  z.number().int().min(0),
  // limit
  z.number().int().min(1),
]);

export class RedisTokenBucketStore implements RateLimitStore {
  constructor(
    private readonly redis: RedisClientProvider,
    private readonly scripts: RedisTokenBucketScriptLoader,
  ) {}

  async consume(input: ConsumeRateLimitInput): Promise<RateLimitDecision> {
    const client = await this.redis.getOpenClient();
    const raw = await this.evalTokenBucketScript(client, input);
    const [allowed, remaining, retryAfterSeconds, resetAtEpochSeconds, limit] = parseSchema(
      RedisDecisionSchema,
      raw,
      'Invalid Redis rate-limit response',
    );

    return {
      allowed: allowed === 1,
      limit,
      remaining,
      retryAfterSeconds,
      resetAtEpochSeconds,
      store: 'redis',
    };
  }

  private buildKey(input: ConsumeRateLimitInput): string {
    return `rate-limit:${input.policyName}:${input.identity.kind}:${input.identity.value}`;
  }

  private async evalTokenBucketScript(
    client: RedisTokenBucketClient,
    input: ConsumeRateLimitInput,
  ): Promise<unknown> {
    const options = {
      keys: [this.buildKey(input)],
      arguments: [
        input.policy.capacity.toString(),
        input.policy.refillTokens.toString(),
        input.policy.refillIntervalMs.toString(),
        input.policy.cost.toString(),
        input.policy.redisKeyTtlMs.toString(),
      ],
    };
    const sha = await this.scripts.getScriptSha(client);

    try {
      return await client.evalSha(sha, options);
    } catch (err) {
      if (!isNoScriptError(err)) {
        throw err;
      }

      this.scripts.clearScriptSha();
      return client.evalSha(await this.scripts.getScriptSha(client), options);
    }
  }
}

function isNoScriptError(err: unknown): boolean {
  return err instanceof Error && err.message.includes('NOSCRIPT');
}
