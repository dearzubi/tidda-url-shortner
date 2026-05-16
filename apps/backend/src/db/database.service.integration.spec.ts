import { Test } from '@nestjs/testing';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { Kysely, sql } from 'kysely';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { DatabaseModule } from './database.module';
import {
  createPostgresPoolConfig,
  DatabaseService,
  executeWithLocalStatementTimeout,
} from './database.service';

describe('createPostgresPoolConfig', () => {
  it('maps explicit database options into pg pool config', () => {
    const config = createPostgresPoolConfig({
      databaseUrl: 'postgres://u:p@localhost:5432/db',
      maxConnections: 20,
      connectionTimeoutMs: 2500,
      idleTimeoutMs: 15000,
    });

    expect(config).toEqual({
      connectionString: 'postgres://u:p@localhost:5432/db',
      max: 20,
      connectionTimeoutMillis: 2500,
      idleTimeoutMillis: 15000,
    });
  });
});

describe('DatabaseService (integration)', () => {
  let container: StartedPostgreSqlContainer;
  let service: DatabaseService;

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:18.3-alpine').start();
  });

  afterAll(async () => {
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
      ],
    }).compile();
    service = moduleRef.get(DatabaseService);
  });

  afterEach(async () => {
    await service.onApplicationShutdown();
  });

  it('returns the same Kysely instance from getDb() on every call', () => {
    const first = service.getDb();
    expect(first).toBeInstanceOf(Kysely);
    expect(service.getDb()).toBe(first);
  });

  it('executes queries via getDb()', async () => {
    const result = await sql<{ ok: number }>`select 1 as ok`.execute(service.getDb());
    expect(Array.isArray(result.rows)).toBe(true);
    expect(result.rows.length).toBeGreaterThan(0);
    expect(result.rows[0]?.ok).toBe(1);
  });

  it('cancels slow readiness queries with a local statement timeout', async () => {
    await expect(
      executeWithLocalStatementTimeout(service.getDb(), 50, async (trx) => {
        await sql`select pg_sleep(1)`.execute(trx);
      }),
    ).rejects.toThrow(/statement timeout/i);
  });
});
