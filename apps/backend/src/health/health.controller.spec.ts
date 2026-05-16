import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { PinoLogger } from 'nestjs-pino';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DatabaseService } from '../db/database.service';
import { RedisService } from '../redis/redis.service';
import { SHUTDOWN_OPTIONS, ShutdownService } from '../shutdown/shutdown.service';
import { HealthController } from './health.controller';

describe('health endpoints', () => {
  let app: NestFastifyApplication;
  let database: { checkConnection: ReturnType<typeof vi.fn> };
  let redis: { checkConnection: ReturnType<typeof vi.fn> };
  let shutdown: ShutdownService;

  beforeEach(async () => {
    database = { checkConnection: vi.fn().mockResolvedValue(undefined) };
    redis = { checkConnection: vi.fn().mockResolvedValue(undefined) };
    const moduleRef = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        ShutdownService,
        { provide: SHUTDOWN_OPTIONS, useValue: { drainDelayMs: 0 } },
        { provide: PinoLogger, useValue: { info: vi.fn(), setContext: vi.fn() } },
        { provide: DatabaseService, useValue: database },
        { provide: RedisService, useValue: redis },
      ],
    }).compile();
    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    shutdown = app.get(ShutdownService);
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it('returns 200 from /livez while healthy', async () => {
    const res = await app.inject({ method: 'GET', url: '/livez' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'ok' });
  });

  it('returns 200 from /readyz when healthy and the database responds', async () => {
    const res = await app.inject({ method: 'GET', url: '/readyz' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'ok' });
  });

  it('returns 503 from /readyz once draining starts', async () => {
    await shutdown.beforeApplicationShutdown();
    const res = await app.inject({ method: 'GET', url: '/readyz' });
    expect(res.statusCode).toBe(503);
    expect(res.json()).toEqual({ status: 'shutting_down' });
  });

  it('still returns 200 from /livez while draining', async () => {
    await shutdown.beforeApplicationShutdown();
    const res = await app.inject({ method: 'GET', url: '/livez' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'ok' });
  });

  it('returns 503 from /readyz when the database check fails', async () => {
    database.checkConnection.mockRejectedValue(new Error('db unavailable'));

    const res = await app.inject({ method: 'GET', url: '/readyz' });
    expect(res.statusCode).toBe(503);
    expect(res.json()).toEqual({ status: 'not_ready' });
  });

  it('returns 503 from /readyz when the Redis check fails', async () => {
    redis.checkConnection.mockRejectedValue(new Error('redis unavailable'));

    const res = await app.inject({ method: 'GET', url: '/readyz' });
    expect(res.statusCode).toBe(503);
    expect(res.json()).toEqual({ status: 'not_ready' });
  });
});
