import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { CreateLinkResponseSchema, GENERATED_LINK_SLUG_PATTERN } from '@tidda/shared';
import { Kysely, PostgresDialect, sql } from 'kysely';
import { type Migration, Migrator } from 'kysely/migration';
import { Pool } from 'pg';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { DatabaseModule } from '../db/database.module';
import { LINK_SLUG_COUNTER_SEQUENCE, LINK_SLUG_COUNTER_START } from '../db/link-slug-counter';
import * as createLinksMigration from '../db/migrations/202605190001_create_links';
import type { DB } from '../db/types';
import { LinksModule } from './links.module';

describe('links HTTP flow (integration)', () => {
  let container: StartedPostgreSqlContainer;
  let db: Kysely<DB>;
  let app: NestFastifyApplication;

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:18.3-alpine').start();
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
    await db?.destroy();
    await container?.stop();
  });

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        DatabaseModule.forRoot({
          databaseUrl: container.getConnectionUri(),
          maxConnections: 10,
          connectionTimeoutMs: 5000,
          idleTimeoutMs: 30000,
        }),
        LinksModule,
      ],
    }).compile();

    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterEach(async () => {
    await app.close();
    await sql`truncate table links restart identity cascade`.execute(db);
    await sql`alter sequence ${sql.ref(LINK_SLUG_COUNTER_SEQUENCE)} restart with ${sql.raw(
      LINK_SLUG_COUNTER_START.toString(),
    )}`.execute(db);
  });

  it('creates and resolves an anonymous generated link', async () => {
    const create = await app.inject({
      method: 'POST',
      url: '/links',
      payload: { destinationUrl: 'https://example.com/a' },
    });

    expect(create.statusCode).toBe(201);
    const body = CreateLinkResponseSchema.parse(create.json());
    expect(body.destinationUrl).toBe('https://example.com/a');
    expect(body.slug).toMatch(GENERATED_LINK_SLUG_PATTERN);
    expect(body.shortPath).toBe(`/${body.slug}`);

    const redirect = await app.inject({ method: 'GET', url: body.shortPath });

    expect(redirect.statusCode).toBe(302);
    expect(redirect.headers.location).toBe('https://example.com/a');
  });
});
