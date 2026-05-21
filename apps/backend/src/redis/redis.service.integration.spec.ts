import { Test } from '@nestjs/testing';
import { RedisContainer, type StartedRedisContainer } from '@testcontainers/redis';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { RedisModule } from './redis.module';
import { RedisService } from './redis.service';

describe('RedisService (integration)', () => {
  let container: StartedRedisContainer;
  let service: RedisService;

  beforeAll(async () => {
    container = await new RedisContainer('redis:8.6.3-alpine').start();
  });

  afterAll(async () => {
    await container?.stop();
  });

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        RedisModule.forRoot({
          redisUrl: container.getConnectionUrl(),
          connectionTimeoutMs: 5000,
        }),
      ],
    }).compile();

    service = moduleRef.get(RedisService);
  });

  it('checks a live Redis connection with PING', async () => {
    await expect(service.checkConnection()).resolves.toBeUndefined();
  });

  it('returns an open Redis client through the shared connection helper', async () => {
    const client = await service.getOpenClient();

    expect(client.isOpen).toBe(true);
    await expect(client.ping()).resolves.toBe('PONG');
    await expect(service.getOpenClient()).resolves.toBe(client);
  });
});
