import { Inject, Injectable, type OnApplicationShutdown } from '@nestjs/common';
import { Kysely, PostgresDialect, sql, type Transaction } from 'kysely';
import { Pool, type PoolConfig } from 'pg';
import type { DB } from './types';

export const DATABASE_OPTIONS = Symbol('DATABASE_OPTIONS');
export const READINESS_STATEMENT_TIMEOUT_MS = 450;

export type DatabaseOptions = {
  databaseUrl: string;
  maxConnections: number;
  connectionTimeoutMs: number;
  idleTimeoutMs: number;
};

export function createPostgresPoolConfig(options: DatabaseOptions): PoolConfig {
  return {
    connectionString: options.databaseUrl,
    max: options.maxConnections,
    connectionTimeoutMillis: options.connectionTimeoutMs,
    idleTimeoutMillis: options.idleTimeoutMs,
  };
}

export async function executeWithLocalStatementTimeout<T>(
  db: Kysely<DB>,
  timeoutMs: number,
  operation: (trx: Transaction<DB>) => Promise<T>,
): Promise<T> {
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0) {
    throw new Error(`Invalid statement timeout: ${timeoutMs}`);
  }

  return db.transaction().execute(async (trx) => {
    await sql`set local statement_timeout = ${sql.raw(String(timeoutMs))}`.execute(trx);
    return operation(trx);
  });
}

@Injectable()
export class DatabaseService implements OnApplicationShutdown {
  private readonly pool: Pool;
  private readonly db: Kysely<DB>;

  constructor(@Inject(DATABASE_OPTIONS) options: DatabaseOptions) {
    this.pool = new Pool(createPostgresPoolConfig(options));
    this.db = new Kysely<DB>({ dialect: new PostgresDialect({ pool: this.pool }) });
  }

  getDb(): Kysely<DB> {
    return this.db;
  }

  async checkConnection(): Promise<void> {
    await executeWithLocalStatementTimeout(this.db, READINESS_STATEMENT_TIMEOUT_MS, async (trx) => {
      await sql<{ ok: number }>`select 1 as ok`.execute(trx);
    });
  }

  async onApplicationShutdown(): Promise<void> {
    await this.db.destroy();
  }
}
