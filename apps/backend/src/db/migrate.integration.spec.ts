import { promises as fsp, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { Kysely, PostgresDialect, sql } from 'kysely';
import { FileMigrationProvider, Migrator } from 'kysely/migration';
import { Pool } from 'pg';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { runMigrations } from './migrate.js';

describe('migrate (integration)', () => {
  let container: StartedPostgreSqlContainer;
  let db: Kysely<unknown>;
  let tmp: string;

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:18.3-alpine').start();
    db = new Kysely({
      dialect: new PostgresDialect({
        pool: new Pool({ connectionString: container.getConnectionUri() }),
      }),
    });
  });

  afterAll(async () => {
    await db?.destroy();
    await container?.stop();
  });

  beforeEach(() => {
    tmp = mkdtempSync(path.join(tmpdir(), 'template-migrate-'));
  });

  afterEach(async () => {
    rmSync(tmp, { recursive: true, force: true });
    await sql`drop schema public cascade`.execute(db);
    await sql`create schema public`.execute(db);
  });

  function writeMigration(name: string, body: string): void {
    writeFileSync(path.join(tmp, name), body);
  }

  function writeWidgetsMigration(): void {
    writeMigration(
      '001_create_widgets.mjs',
      `export async function up(db) {
         await db.schema.createTable('widgets')
           .addColumn('id', 'integer', (c) => c.primaryKey())
           .execute();
       }
       export async function down(db) {
         await db.schema.dropTable('widgets').execute();
       }`,
    );
  }

  function migratorFor(): Migrator {
    return new Migrator({
      db,
      provider: new FileMigrationProvider({ fs: fsp, path, migrationFolder: tmp }),
    });
  }

  async function widgetsExists(): Promise<boolean> {
    const result = await sql<{ exists: boolean }>`
      select exists (
        select 1 from information_schema.tables
        where table_schema = 'public' and table_name = 'widgets'
      ) as exists
    `.execute(db);
    return result.rows[0]?.exists ?? false;
  }

  it('runs up migrations against the database', async () => {
    writeWidgetsMigration();

    const result = await runMigrations({ migrator: migratorFor(), direction: 'up' });

    expect(result.ok).toBe(true);
    expect(await widgetsExists()).toBe(true);
  });

  it('rolls back the last migration with direction=down', async () => {
    writeWidgetsMigration();

    await runMigrations({ migrator: migratorFor(), direction: 'up' });
    const result = await runMigrations({ migrator: migratorFor(), direction: 'down' });

    expect(result.ok).toBe(true);
    expect(await widgetsExists()).toBe(false);
  });

  it('returns ok=false when a migration throws', async () => {
    writeMigration(
      '001_bad.mjs',
      `export async function up() {
         throw new Error('intentional');
       }
       export async function down() {}`,
    );

    const result = await runMigrations({ migrator: migratorFor(), direction: 'up' });

    expect(result.ok).toBe(false);
    expect(await widgetsExists()).toBe(false);
  });
});
