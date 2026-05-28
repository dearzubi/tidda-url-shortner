import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { type Generated, Kysely, PostgresDialect, sql } from 'kysely';
import { Pool } from 'pg';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  postgresRoleExists,
  provisionAppRole,
  quotePostgresIdentifier,
} from './provision-app-role';

type ShortLinkAuditTable = {
  id: Generated<number>;
  slug: string;
};

type ProvisionAppRoleTestDatabase = {
  app_created_short_link_audits: ShortLinkAuditTable;
  existing_short_link_audits: ShortLinkAuditTable;
  future_short_link_audits: ShortLinkAuditTable;
};

describe('provisionAppRole (integration)', () => {
  let container: StartedPostgreSqlContainer;
  let adminDb: Kysely<ProvisionAppRoleTestDatabase>;
  let createdRoles: string[];

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:18.3-alpine').start();
    adminDb = createDb(container.getConnectionUri());
  });

  afterAll(async () => {
    await adminDb?.destroy();
    await container?.stop();
  });

  beforeEach(() => {
    createdRoles = [];
  });

  afterEach(async () => {
    await sql`drop schema public cascade`.execute(adminDb);
    await sql`create schema public`.execute(adminDb);

    for (const roleName of createdRoles) {
      if (await postgresRoleExists(adminDb, roleName)) {
        await sql.raw(`drop owned by ${quotePostgresIdentifier(roleName)}`).execute(adminDb);
        await sql.raw(`drop role ${quotePostgresIdentifier(roleName)}`).execute(adminDb);
      }
    }
  });

  function createDb(
    connectionString: string,
    credentials?: { username: string; password: string },
  ): Kysely<ProvisionAppRoleTestDatabase> {
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

  it('creates an app role that can use existing and future tables in the schema', async () => {
    const appUsername = uniqueRoleName('app');
    const appPassword = "safe $$ password with ' quote, \\ backslash and ; semicolon";

    await adminDb.schema
      .createTable('existing_short_link_audits')
      .addColumn('id', 'serial', (column) => column.primaryKey())
      .addColumn('slug', 'text', (column) => column.notNull())
      .execute();
    await sql`revoke create on schema public from public`.execute(adminDb);

    await provisionAppRole(adminDb, {
      databaseName: container.getDatabase(),
      schemaName: 'public',
      appUsername,
      appPassword,
    });

    await adminDb.schema
      .createTable('future_short_link_audits')
      .addColumn('id', 'serial', (column) => column.primaryKey())
      .addColumn('slug', 'text', (column) => column.notNull())
      .execute();

    const appDb = createDb(container.getConnectionUri(), {
      username: appUsername,
      password: appPassword,
    });

    try {
      await appDb.schema
        .createTable('app_created_short_link_audits')
        .addColumn('id', 'serial', (column) => column.primaryKey())
        .addColumn('slug', 'text', (column) => column.notNull())
        .execute();
      const existingInsert = await appDb
        .insertInto('existing_short_link_audits')
        .values({ slug: 'existing' })
        .returning('id')
        .executeTakeFirstOrThrow();
      const futureInsert = await appDb
        .insertInto('future_short_link_audits')
        .values({ slug: 'future' })
        .returning('id')
        .executeTakeFirstOrThrow();

      await appDb
        .updateTable('existing_short_link_audits')
        .set({ slug: 'updated' })
        .where('id', '=', existingInsert.id)
        .execute();
      const selected = await appDb
        .selectFrom('existing_short_link_audits')
        .select('slug')
        .where('id', '=', existingInsert.id)
        .executeTakeFirstOrThrow();
      await appDb
        .deleteFrom('future_short_link_audits')
        .where('id', '=', futureInsert.id)
        .execute();

      expect(selected.slug).toBe('updated');
    } finally {
      await appDb.destroy();
    }
  });

  it('rolls back role creation when a later grant fails', async () => {
    const appUsername = uniqueRoleName('rollback');

    await expect(
      provisionAppRole(adminDb, {
        databaseName: container.getDatabase(),
        schemaName: 'missing_schema',
        appUsername,
        appPassword: 'safe password',
      }),
    ).rejects.toThrow(/schema "missing_schema" does not exist/i);

    expect(await postgresRoleExists(adminDb, appUsername)).toBe(false);
  });
});
