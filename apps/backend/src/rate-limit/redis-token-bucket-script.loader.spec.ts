import { describe, expect, it, vi } from 'vitest';
import { RedisTokenBucketScriptLoader } from './redis-token-bucket-script.loader';

describe('RedisTokenBucketScriptLoader', () => {
  it('does not fail module initialisation when Redis script loading fails', async () => {
    const redis = {
      getOpenClient: vi.fn().mockRejectedValue(new Error('redis down')),
    };
    const loader = new RedisTokenBucketScriptLoader(redis);

    await expect(loader.onModuleInit()).resolves.toBeUndefined();
  });
});
