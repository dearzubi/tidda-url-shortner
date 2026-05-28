import { promises as fsp, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { Kysely, PostgresDialect, sql } from 'kysely';
import { FileMigrationProvider, Migrator } from 'kysely/migration';
import { Pool } from 'pg';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { runMigrations } from './migrate.js';
import {
  postgresRoleExists,
  provisionAppRole,
  quotePostgresIdentifier,
} from './provision-app-role';

describe('migrate (integration)', () => {
  let container: StartedPostgreSqlContainer;
  let db: Kysely<unknown>;
  let tmp: string;
  let createdRoles: string[];

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
    createdRoles = [];
  });

  afterEach(async () => {
    rmSync(tmp, { recursive: true, force: true });

    for (const roleName of createdRoles) {
      if (await postgresRoleExists(db, roleName)) {
        await sql.raw(`drop owned by ${quotePostgresIdentifier(roleName)}`).execute(db);
        await sql.raw(`drop role ${quotePostgresIdentifier(roleName)}`).execute(db);
      }
    }

    await sql`drop schema public cascade`.execute(db);
    await sql`create schema public`.execute(db);
  });

  function createDb(
    connectionString: string,
    credentials?: { username: string; password: string },
  ): Kysely<unknown> {
    const databaseUrl = new URL(connectionString);

    if (credentials) {
      databaseUrl.username = credentials.username;
      databaseUrl.password = credentials.password;
    }

    return new Kysely({
      dialect: new PostgresDialect({
        pool: new Pool({ connectionString: databaseUrl.toString() }),
      }),
    });
  }

  function uniqueRoleName(suffix: string): string {
    const roleName = `tidda_${suffix}_${Date.now()}`;
    createdRoles.push(roleName);
    return roleName;
  }

  function writeMigration(name: string, body: string): void {
    writeFileSync(path.join(tmp, name), body);
  }

  function writeShortLinkAuditsMigration(): void {
    writeMigration(
      '001_create_short_link_audits.mjs',
      `export async function up(db) {
         await db.schema.createTable('short_link_audits')
           .addColumn('id', 'integer', (c) => c.primaryKey())
           .addColumn('slug', 'text', (c) => c.notNull())
           .execute();
       }
       export async function down(db) {
         await db.schema.dropTable('short_link_audits').execute();
       }`,
    );
  }

  function migratorFor(migrationDb: Kysely<unknown> = db): Migrator {
    return new Migrator({
      db: migrationDb,
      provider: new FileMigrationProvider({ fs: fsp, path, migrationFolder: tmp }),
    });
  }

  async function shortLinkAuditsExists(): Promise<boolean> {
    const result = await sql<{ exists: boolean }>`
      select exists (
        select 1 from information_schema.tables
        where table_schema = 'public' and table_name = 'short_link_audits'
      ) as exists
    `.execute(db);
    return result.rows[0]?.exists ?? false;
  }

  it('runs up migrations against the database', async () => {
    writeShortLinkAuditsMigration();

    const result = await runMigrations({ migrator: migratorFor(), direction: 'up' });

    expect(result.ok).toBe(true);
    expect(await shortLinkAuditsExists()).toBe(true);
  });

  it('runs migrations with the provisioned app role', async () => {
    const appUsername = uniqueRoleName('migrator');
    const appPassword = "safe $$ password with ' quote, \\ backslash and ; semicolon";

    writeShortLinkAuditsMigration();
    await sql`revoke create on schema public from public`.execute(db);
    await provisionAppRole(db, {
      databaseName: container.getDatabase(),
      schemaName: 'public',
      appUsername,
      appPassword,
    });

    const appDb = createDb(container.getConnectionUri(), {
      username: appUsername,
      password: appPassword,
    });

    try {
      const result = await runMigrations({ migrator: migratorFor(appDb), direction: 'up' });

      expect(result.ok).toBe(true);
      expect(await shortLinkAuditsExists()).toBe(true);
    } finally {
      await appDb.destroy();
    }
  });

  it('rolls back the last migration with direction=down', async () => {
    writeShortLinkAuditsMigration();

    await runMigrations({ migrator: migratorFor(), direction: 'up' });
    const result = await runMigrations({ migrator: migratorFor(), direction: 'down' });

    expect(result.ok).toBe(true);
    expect(await shortLinkAuditsExists()).toBe(false);
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
    expect(await shortLinkAuditsExists()).toBe(false);
  });
});
