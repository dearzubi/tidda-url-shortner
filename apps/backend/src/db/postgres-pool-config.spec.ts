import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createPostgresPoolConfig } from './database.service';
import { createMigrationPoolConfig } from './migrate';
import { createProvisionAppRolePoolConfig } from './provision-app-role';

function withCaFile<T>(operation: (caFile: string, ca: string) => T): T {
  const tmp = mkdtempSync(path.join(tmpdir(), 'tidda-rds-ca-'));
  const caFile = path.join(tmp, 'global-bundle.pem');
  const ca = '-----BEGIN CERTIFICATE-----\ntest-rds-ca\n-----END CERTIFICATE-----\n';
  writeFileSync(caFile, ca);

  try {
    return operation(caFile, ca);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

describe('Postgres pool config', () => {
  it('maps backend database options into pg pool config', () => {
    const config = createPostgresPoolConfig({
      databaseUrl: 'postgres://u:p@localhost:5432/db',
      ssl: false,
      maxConnections: 20,
      connectionTimeoutMs: 2500,
      idleTimeoutMs: 15000,
    });

    expect(config).toMatchObject({
      connectionString: 'postgres://u:p@localhost:5432/db',
      ssl: undefined,
      max: 20,
      connectionTimeoutMillis: 2500,
      idleTimeoutMillis: 15000,
    });
  });

  it('loads the configured CA bundle for backend SSL verification', () => {
    withCaFile((sslCaFile, ca) => {
      const config = createPostgresPoolConfig({
        databaseUrl: 'postgres://u:p@localhost:5432/db',
        ssl: true,
        sslCaFile,
        maxConnections: 20,
        connectionTimeoutMs: 2500,
        idleTimeoutMs: 15000,
      });

      expect(config.ssl).toMatchObject({ rejectUnauthorized: true, ca });
    });
  });

  it('loads the configured CA bundle for migration SSL verification', () => {
    withCaFile((DATABASE_SSL_CA_FILE, ca) => {
      const config = createMigrationPoolConfig({
        DATABASE_URL: 'postgres://u:p@localhost:5432/db',
        DATABASE_SSL: true,
        DATABASE_SSL_CA_FILE,
      });

      expect(config).toMatchObject({
        connectionString: 'postgres://u:p@localhost:5432/db',
        ssl: { rejectUnauthorized: true, ca },
      });
    });
  });

  it('replaces app credentials with admin credentials for role provisioning', () => {
    const config = createProvisionAppRolePoolConfig({
      DATABASE_URL: 'postgres://tidda_app:app-secret@db.example.internal:5432/tidda',
      DATABASE_ADMIN_USER: 'tidda_admin',
      DATABASE_ADMIN_PASSWORD: 'admin secret',
      DATABASE_SSL: false,
      DATABASE_SSL_CA_FILE: undefined,
    });

    expect(config).toMatchObject({
      connectionString: 'postgres://tidda_admin:admin%20secret@db.example.internal:5432/tidda',
      ssl: undefined,
    });
  });
});
