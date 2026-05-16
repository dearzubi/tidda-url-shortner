import '../config/load-env-files.bootstrap';

import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { Kysely, PostgresDialect } from 'kysely';
import { FileMigrationProvider, type Migrator, Migrator as MigratorImpl } from 'kysely/migration';
import { Pool } from 'pg';
import { loadEnv } from '../config/env';
import type { DB } from './types';

export type Direction = 'up' | 'down';

export type MigrationLogger = {
  log: (msg: string) => void;
  error: (err: unknown) => void;
};

export type MigratorLike = Pick<Migrator, 'migrateToLatest' | 'migrateDown'>;

export function parseDirection(argv: ReadonlyArray<string>): Direction {
  return argv[2] === 'down' ? 'down' : 'up';
}

export async function runMigrations(opts: {
  migrator: MigratorLike;
  direction: Direction;
  logger?: MigrationLogger;
}): Promise<{ ok: boolean }> {
  const logger = opts.logger ?? console;
  const { error, results } =
    opts.direction === 'down'
      ? await opts.migrator.migrateDown()
      : await opts.migrator.migrateToLatest();

  for (const r of results ?? []) {
    const status = r.status === 'Success' ? 'OK' : r.status;
    logger.log(`[migrate ${opts.direction}] ${r.migrationName} -> ${status}`);
  }
  if (error) {
    logger.error(error);
    return { ok: false };
  }
  return { ok: true };
}

async function main(): Promise<void> {
  const env = loadEnv();
  const db = new Kysely<DB>({
    dialect: new PostgresDialect({ pool: new Pool({ connectionString: env.DATABASE_URL }) }),
  });
  const migrator = new MigratorImpl({
    db,
    provider: new FileMigrationProvider({
      fs,
      path,
      migrationFolder: path.join(__dirname, 'migrations'),
    }),
  });

  try {
    const { ok } = await runMigrations({ migrator, direction: parseDirection(process.argv) });
    if (!ok) process.exit(1);
  } finally {
    await db.destroy();
  }
}

if (require.main === module) {
  void main();
}
