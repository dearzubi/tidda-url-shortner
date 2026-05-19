import { Test } from '@nestjs/testing';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { Kysely, PostgresDialect, sql } from 'kysely';
import { type Migration, Migrator } from 'kysely/migration';
import { Pool } from 'pg';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { DatabaseModule } from '../db/database.module';
import { DatabaseService } from '../db/database.service';
import { LINK_SLUG_COUNTER_SEQUENCE, LINK_SLUG_COUNTER_START } from '../db/link-slug-counter';
import * as createLinksMigration from '../db/migrations/202605190001_create_links';
import type { DB } from '../db/types';
import { LinkRepository } from './link.repository';

describe('LinkRepository (integration)', () => {
  let container: StartedPostgreSqlContainer;
  let db: Kysely<DB>;
  let database: DatabaseService;
  let repository: LinkRepository;

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
      ],
      providers: [LinkRepository],
    }).compile();

    database = moduleRef.get(DatabaseService);
    repository = moduleRef.get(LinkRepository);
  });

  afterEach(async () => {
    await sql`truncate table links restart identity cascade`.execute(db);
    await sql`alter sequence ${sql.ref(LINK_SLUG_COUNTER_SEQUENCE)} restart with ${sql.raw(
      LINK_SLUG_COUNTER_START.toString(),
    )}`.execute(db);
    await database.onApplicationShutdown();
  });

  it('creates and reads a link by slug', async () => {
    const created = await repository.create({
      slug: '100000',
      destinationUrl: 'https://example.com/a',
    });

    const found = await repository.findBySlug('100000');

    expect(found).toEqual(created);
    expect(found).toMatchObject({
      slug: '100000',
      destinationUrl: 'https://example.com/a',
    });
    expect(found?.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    expect(found?.createdAt).toBeInstanceOf(Date);
  });

  it('allocates monotonically increasing slug counters', async () => {
    const first = await repository.nextSlugCounter();
    const second = await repository.nextSlugCounter();

    expect(first).toBe(LINK_SLUG_COUNTER_START);
    expect(second).toBe(LINK_SLUG_COUNTER_START + 1n);
  });

  it('returns null when a slug is not stored', async () => {
    await expect(repository.findBySlug('Missing')).resolves.toBeNull();
  });

  it('rejects duplicate slugs through the database constraint', async () => {
    await repository.create({ slug: '100000', destinationUrl: 'https://example.com/a' });

    await expect(
      repository.create({ slug: '100000', destinationUrl: 'https://example.com/b' }),
    ).rejects.toThrow();
  });
});
