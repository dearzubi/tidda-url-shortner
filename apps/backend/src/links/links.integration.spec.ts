import type { OutgoingHttpHeader } from 'node:http';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { RedisContainer, type StartedRedisContainer } from '@testcontainers/redis';
import { CreateLinkResponseSchema, GENERATED_LINK_SLUG_PATTERN } from '@tidda/shared';
import { Kysely, PostgresDialect, sql } from 'kysely';
import { type Migration, Migrator } from 'kysely/migration';
import { Pool } from 'pg';
import { createClient, type RedisClientType } from 'redis';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { DatabaseModule } from '../db/database.module';
import { LINK_SLUG_COUNTER_SEQUENCE, LINK_SLUG_COUNTER_START } from '../db/link-slug-counter';
import * as createLinksMigration from '../db/migrations/202605190001_create_links';
import type { DB } from '../db/types';
import { LoggingModule } from '../logging/logging.module';
import { getRateLimitPolicy } from '../rate-limit/rate-limit.policies';
import { RedisModule } from '../redis/redis.module';
import { LinksModule } from './links.module';

describe('links HTTP flow (integration)', () => {
  let container: StartedPostgreSqlContainer;
  let redisContainer: StartedRedisContainer;
  let redisClient: RedisClientType;
  let db: Kysely<DB>;
  let app: NestFastifyApplication;

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:18.3-alpine').start();
    redisContainer = await new RedisContainer('redis:8.6.3-alpine').start();
    redisClient = createClient({ url: redisContainer.getConnectionUrl() });
    await redisClient.connect();
    db = new Kysely<DB>({
      dialect: new PostgresDialect({
        pool: new Pool({ connectionString: container.getConnectionUri() }),
      }),
    });
    const migrator = new Migrator({
      db,
      provider: {
        async getMigrations(): Promise<Record<string, Migration>> {
          return {
            '202605190001_create_links': createLinksMigration,
          };
        },
      },
    });

    const { error } = await migrator.migrateToLatest();
    if (error) {
      throw error;
    }
  });

  afterAll(async () => {
    redisClient?.destroy();
    await redisContainer?.stop();
    await db?.destroy();
    await container?.stop();
  });

  beforeEach(async () => {
    await redisClient.flushDb();

    const moduleRef = await Test.createTestingModule({
      imports: [
        LoggingModule.forRoot({
          level: 'error',
          pretty: false,
          service: 'backend',
        }),
        DatabaseModule.forRoot({
          databaseUrl: container.getConnectionUri(),
          maxConnections: 10,
          connectionTimeoutMs: 5000,
          idleTimeoutMs: 30000,
        }),
        RedisModule.forRoot({
          redisUrl: redisContainer.getConnectionUrl(),
          connectionTimeoutMs: 5000,
        }),
        LinksModule,
      ],
    }).compile();

    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterEach(async () => {
    await app?.close();
    await sql`truncate table links restart identity cascade`.execute(db);
    await sql`alter sequence ${sql.ref(LINK_SLUG_COUNTER_SEQUENCE)} restart with ${sql.raw(
      LINK_SLUG_COUNTER_START.toString(),
    )}`.execute(db);
  });

  it('creates and resolves an anonymous generated link', async () => {
    const create = await app.inject({
      method: 'POST',
      url: '/links',
      remoteAddress: '203.0.113.10',
      payload: { destinationUrl: 'https://example.com/a' },
    });

    expect(create.statusCode).toBe(201);
    expectRateLimitHeader(create.headers['x-ratelimit-limit']);
    expectRateLimitHeader(create.headers['x-ratelimit-remaining']);
    expectRateLimitHeader(create.headers['x-ratelimit-reset']);

    const body = CreateLinkResponseSchema.parse(create.json());
    expect(body.destinationUrl).toBe('https://example.com/a');
    expect(body.slug).toMatch(GENERATED_LINK_SLUG_PATTERN);
    expect(body.shortPath).toBe(`/${body.slug}`);

    const redirect = await app.inject({ method: 'GET', url: body.shortPath });

    expect(redirect.statusCode).toBe(302);
    expect(redirect.headers.location).toBe('https://example.com/a');
  });

  it('rejects anonymous link creation after the IP bucket is exhausted', async () => {
    const policy = getRateLimitPolicy('links.create.anonymous');
    const allowedRequestCount = Math.floor(policy.capacity / policy.cost);
    const remoteAddress = '203.0.113.11';

    for (let requestIndex = 0; requestIndex < allowedRequestCount; requestIndex += 1) {
      const allowed = await app.inject({
        method: 'POST',
        url: '/links',
        remoteAddress,
        payload: { destinationUrl: `https://example.com/${requestIndex}` },
      });

      expect(allowed.statusCode).toBe(201);
    }

    const rejected = await app.inject({
      method: 'POST',
      url: '/links',
      remoteAddress,
      payload: { destinationUrl: 'https://example.com/exhausted' },
    });

    expect(rejected.statusCode).toBe(429);
    expect(rejected.headers['retry-after']).toBeDefined();
    expect(rejected.headers['x-ratelimit-remaining']).toBe('0');
  });
});

function expectRateLimitHeader(header: OutgoingHttpHeader | undefined): void {
  if (typeof header !== 'string') {
    throw new Error('Expected a string rate limit header');
  }

  expect(header).toMatch(/^\d+$/);
}
