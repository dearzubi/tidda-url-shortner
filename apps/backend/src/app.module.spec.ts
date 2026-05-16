import { type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';
import { AppModule } from './app.module';
import type { Env } from './config/env';
import { configureApp, createFastifyAdapter } from './create-app';
import { DatabaseService } from './db/database.service';
import { RedisService } from './redis/redis.service';

const env: Env = {
  NODE_ENV: 'test',
  BACKEND_PORT: 3000,
  DATABASE_URL: 'postgres://u:p@localhost:5432/db',
  REDIS_URL: 'redis://localhost:6379',
  DB_POOL_MAX: 10,
  DB_POOL_CONNECTION_TIMEOUT_MS: 5000,
  DB_POOL_IDLE_TIMEOUT_MS: 30000,
  SHUTDOWN_DRAIN_DELAY_MS: 0,
  SHUTDOWN_TIMEOUT_MS: 1000,
  OTEL_TRACES_ENABLED: false,
  OTEL_EXPORTER_OTLP_TRACES_ENDPOINT: 'http://localhost:4318/v1/traces',
  OTEL_SERVICE_NAME: 'backend',
};

describe('AppModule', () => {
  it('is configured from parsed env instead of reading process.env at import time', () => {
    const module = AppModule.forRoot(env);

    expect(module.module).toBe(AppModule);
    expect(module.imports?.length).toBeGreaterThan(0);
  });

  it('boots a Fastify app from the configured module graph', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule.forRoot(env)],
    })
      .overrideProvider(DatabaseService)
      .useValue({
        checkConnection: async () => undefined,
        onApplicationShutdown: async () => undefined,
      })
      .overrideProvider(RedisService)
      .useValue({
        checkConnection: async () => undefined,
        onApplicationShutdown: async () => undefined,
      })
      .compile();
    const app = moduleRef.createNestApplication<NestFastifyApplication>(createFastifyAdapter(), {
      bufferLogs: true,
    });
    configureApp(app);

    try {
      await app.init();
      await app.getHttpAdapter().getInstance().ready();

      const res = await app.inject({ method: 'GET', url: '/livez' });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ status: 'ok' });
      expect(res.headers['x-request-id']).toBeTypeOf('string');
    } finally {
      await app.close();
    }
  });
});
