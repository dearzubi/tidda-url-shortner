import '../config/load-env-files.bootstrap';

import { Kysely, PostgresDialect, type RawBuilder, sql, type Transaction } from 'kysely';
import { Pool, type PoolConfig } from 'pg';
import { type Env, loadEnv } from '../config/env';
import { createPostgresSslConfig } from './database.service';
import type { DB } from './types';

export type ProvisionAppRoleInput = {
  databaseName: string;
  schemaName: string;
  appUsername: string;
  appPassword: string;
};

type ProvisionAppRolePoolEnv = Pick<Env, 'DATABASE_SSL' | 'DATABASE_SSL_CA_FILE'> & {
  DATABASE_URL: string;
  DATABASE_ADMIN_USER: string;
  DATABASE_ADMIN_PASSWORD: string;
};

const PostgresIdentifierPattern = /^[A-Za-z_][A-Za-z0-9_]{0,62}$/;

function assertPostgresIdentifier(value: string, label: string): string {
  if (!PostgresIdentifierPattern.test(value)) {
    throw new Error(`${label} must be a valid unquoted PostgreSQL identifier`);
  }

  return value;
}

export function quotePostgresIdentifier(value: string): string {
  return `"${assertPostgresIdentifier(value, 'identifier')}"`;
}

function postgresIdentifier(value: string, label: string): RawBuilder<unknown> {
  return sql.id(assertPostgresIdentifier(value, label));
}

async function quotePostgresLiteral<TDatabase>(
  db: Kysely<TDatabase> | Transaction<TDatabase>,
  value: string,
): Promise<string> {
  const result = await sql<{ literal: string }>`select quote_literal(${value}) as literal`.execute(
    db,
  );
  const literal = result.rows[0]?.literal;

  if (!literal) {
    throw new Error('Failed to quote PostgreSQL literal');
  }

  return literal;
}

export async function postgresRoleExists<TDatabase>(
  db: Kysely<TDatabase> | Transaction<TDatabase>,
  roleName: string,
): Promise<boolean> {
  const result = await sql<{ exists: boolean }>`
    select exists (
      select 1 from pg_catalog.pg_roles where rolname = ${roleName}
    ) as exists
  `.execute(db);

  return result.rows[0]?.exists ?? false;
}

export function buildPostgresRoleProvisioningSql(
  input: ProvisionAppRoleInput,
  options: { createRole: boolean; passwordLiteral: string },
): RawBuilder<unknown>[] {
  const appRole = postgresIdentifier(input.appUsername, 'appUsername');
  const appRoleSql = quotePostgresIdentifier(input.appUsername);
  const database = postgresIdentifier(input.databaseName, 'databaseName');
  const schema = postgresIdentifier(input.schemaName, 'schemaName');

  return [
    sql`CREATE EXTENSION IF NOT EXISTS pgcrypto`,
    ...(options.createRole
      ? [sql.raw(`CREATE ROLE ${appRoleSql} LOGIN PASSWORD ${options.passwordLiteral}`)]
      : []),
    sql.raw(`ALTER ROLE ${appRoleSql} WITH LOGIN PASSWORD ${options.passwordLiteral}`),
    sql`GRANT CONNECT ON DATABASE ${database} TO ${appRole}`,
    sql`GRANT USAGE ON SCHEMA ${schema} TO ${appRole}`,
    sql`GRANT CREATE ON SCHEMA ${schema} TO ${appRole}`,
    sql`GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA ${schema} TO ${appRole}`,
    sql`GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA ${schema} TO ${appRole}`,
    sql`ALTER DEFAULT PRIVILEGES IN SCHEMA ${schema} GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ${appRole}`,
    sql`ALTER DEFAULT PRIVILEGES IN SCHEMA ${schema} GRANT USAGE, SELECT ON SEQUENCES TO ${appRole}`,
  ];
}

export function createProvisionAppRolePoolConfig(env: ProvisionAppRolePoolEnv): PoolConfig {
  const adminDatabaseUrl = new URL(env.DATABASE_URL);
  adminDatabaseUrl.username = env.DATABASE_ADMIN_USER;
  adminDatabaseUrl.password = env.DATABASE_ADMIN_PASSWORD;

  return {
    connectionString: adminDatabaseUrl.toString(),
    ssl: createPostgresSslConfig({
      enabled: env.DATABASE_SSL,
      caFile: env.DATABASE_SSL_CA_FILE,
    }),
  };
}

export async function provisionAppRole<TDatabase>(
  db: Kysely<TDatabase>,
  input: ProvisionAppRoleInput,
): Promise<void> {
  await db.transaction().execute(async (trx) => {
    const roleExists = await postgresRoleExists(trx, input.appUsername);
    const passwordLiteral = await quotePostgresLiteral(trx, input.appPassword);

    for (const statement of buildPostgresRoleProvisioningSql(input, {
      createRole: !roleExists,
      passwordLiteral,
    })) {
      await statement.execute(trx);
    }
  });
}

async function main(): Promise<void> {
  const env = loadEnv();

  if (
    !env.DATABASE_NAME ||
    !env.DATABASE_USER ||
    !env.DATABASE_PASSWORD ||
    !env.DATABASE_ADMIN_USER ||
    !env.DATABASE_ADMIN_PASSWORD
  ) {
    throw new Error(
      'DATABASE_NAME, DATABASE_USER, DATABASE_PASSWORD, DATABASE_ADMIN_USER, and DATABASE_ADMIN_PASSWORD are required',
    );
  }

  const db = new Kysely<DB>({
    dialect: new PostgresDialect({
      pool: new Pool(
        createProvisionAppRolePoolConfig({
          DATABASE_URL: env.DATABASE_URL,
          DATABASE_ADMIN_USER: env.DATABASE_ADMIN_USER,
          DATABASE_ADMIN_PASSWORD: env.DATABASE_ADMIN_PASSWORD,
          DATABASE_SSL: env.DATABASE_SSL,
          ...(env.DATABASE_SSL_CA_FILE ? { DATABASE_SSL_CA_FILE: env.DATABASE_SSL_CA_FILE } : {}),
        }),
      ),
    }),
  });

  try {
    await provisionAppRole(db, {
      databaseName: env.DATABASE_NAME,
      schemaName: env.DATABASE_SCHEMA,
      appUsername: env.DATABASE_USER,
      appPassword: env.DATABASE_PASSWORD,
    });
  } finally {
    await db.destroy();
  }
}

if (require.main === module) {
  main().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
