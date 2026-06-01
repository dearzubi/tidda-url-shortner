import { describe, expect, it } from 'vitest';
import { type EnvSource, parseEnv } from './env';

function makeEnv(overrides: EnvSource = {}): EnvSource {
  return {
    NODE_ENV: 'development',
    BACKEND_PORT: '3000',
    DATABASE_URL: 'postgres://u:p@localhost:5432/db',
    REDIS_URL: 'redis://localhost:6379',
    ...overrides,
  };
}

function expectPositiveNumber(v: number) {
  expect(v).toBeGreaterThan(0);
}

describe('parseEnv', () => {
  it('returns a typed config when all required vars are present', () => {
    const result = parseEnv(makeEnv());
    expect(result.NODE_ENV).toBe('development');
    expect(result.BACKEND_PORT).toBe(3000);
    expect(result.DATABASE_URL).toBe('postgres://u:p@localhost:5432/db');
    expect(result.REDIS_URL).toBe('redis://localhost:6379');
    expectPositiveNumber(result.DB_POOL_MAX);
    expectPositiveNumber(result.DB_POOL_CONNECTION_TIMEOUT_MS);
    expectPositiveNumber(result.DB_POOL_IDLE_TIMEOUT_MS);
    expectPositiveNumber(result.SHUTDOWN_DRAIN_DELAY_MS);
    expectPositiveNumber(result.SHUTDOWN_TIMEOUT_MS);
    expect(result.OTEL_TRACES_ENABLED).toBeTypeOf('boolean');

    if (result.OTEL_TRACES_ENABLED) {
      expect(result.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT).toBeTypeOf('string');
      expectPositiveNumber(result.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT.length);
      expect(result.OTEL_SERVICE_NAME).toBeTypeOf('string');
      expectPositiveNumber(result.OTEL_SERVICE_NAME.length);
    }
  });

  it('accepts explicit database pool bounds', () => {
    const result = parseEnv(
      makeEnv({
        DB_POOL_MAX: '20',
        DB_POOL_CONNECTION_TIMEOUT_MS: '2500',
        DB_POOL_IDLE_TIMEOUT_MS: '15000',
      }),
    );

    expect(result.DB_POOL_MAX).toBe(20);
    expect(result.DB_POOL_CONNECTION_TIMEOUT_MS).toBe(2500);
    expect(result.DB_POOL_IDLE_TIMEOUT_MS).toBe(15000);
  });

  it('builds DATABASE_URL from split database fields', () => {
    const result = parseEnv(
      makeEnv({
        DATABASE_URL: undefined,
        DATABASE_HOST: 'tidda-db.example.internal',
        DATABASE_PORT: '5432',
        DATABASE_NAME: 'tidda',
        DATABASE_USER: 'tidda_app',
        DATABASE_PASSWORD: 'safe password',
      }),
    );

    expect(result.DATABASE_URL).toBe(
      'postgres://tidda_app:safe%20password@tidda-db.example.internal:5432/tidda',
    );
  });

  it.each([
    { case: 'a scheme', DATABASE_HOST: 'postgres://db' },
    { case: 'a port', DATABASE_HOST: 'db:5432' },
    { case: 'a path', DATABASE_HOST: 'db/path' },
    { case: 'credentials', DATABASE_HOST: 'user:pass@db' },
  ])('rejects split DATABASE_HOST with $case', ({ DATABASE_HOST }) => {
    expect(() =>
      parseEnv(
        makeEnv({
          DATABASE_URL: undefined,
          DATABASE_HOST,
          DATABASE_NAME: 'tidda',
          DATABASE_USER: 'tidda_app',
          DATABASE_PASSWORD: 'safe password',
        }),
      ),
    ).toThrow(/Invalid environment/);
  });

  it('builds REDIS_URL from split Redis fields with TLS and auth', () => {
    const result = parseEnv(
      makeEnv({
        REDIS_URL: undefined,
        REDIS_HOST: 'tidda-redis.example.internal',
        REDIS_PORT: '6379',
        REDIS_PASSWORD: 'redis secret',
        REDIS_TLS: 'true',
      }),
    );

    expect(result.REDIS_URL).toBe('rediss://:redis%20secret@tidda-redis.example.internal:6379');
  });

  it('builds REDIS_URL from a Docker DNS Redis host', () => {
    const result = parseEnv(
      makeEnv({
        REDIS_URL: undefined,
        REDIS_HOST: 'redis',
      }),
    );

    expect(result.REDIS_URL).toBe('redis://redis:6379');
  });

  it.each([
    { case: 'a scheme', REDIS_HOST: 'redis://cache' },
    { case: 'a port', REDIS_HOST: 'cache:6379' },
    { case: 'a path', REDIS_HOST: 'cache/path' },
    { case: 'credentials', REDIS_HOST: 'user:pass@cache' },
  ])('rejects split REDIS_HOST with $case', ({ REDIS_HOST }) => {
    expect(() =>
      parseEnv(
        makeEnv({
          REDIS_URL: undefined,
          REDIS_HOST,
        }),
      ),
    ).toThrow(/Invalid environment/);
  });

  it('requires either DATABASE_URL or all split database fields', () => {
    expect(() =>
      parseEnv(
        makeEnv({
          DATABASE_URL: undefined,
          DATABASE_HOST: 'tidda-db.example.internal',
        }),
      ),
    ).toThrow(/Invalid environment/);
  });

  it('accepts explicit graceful shutdown timings', () => {
    const result = parseEnv(
      makeEnv({
        SHUTDOWN_DRAIN_DELAY_MS: '5000',
        SHUTDOWN_TIMEOUT_MS: '45000',
      }),
    );

    expect(result.SHUTDOWN_DRAIN_DELAY_MS).toBe(5000);
    expect(result.SHUTDOWN_TIMEOUT_MS).toBe(45000);
  });

  it('defaults BACKEND_TRUSTED_PROXIES to false', () => {
    const result = parseEnv(makeEnv());

    expect(result.BACKEND_TRUSTED_PROXIES).toBe(false);
  });

  it('parses BACKEND_TRUSTED_PROXIES as a comma-separated list', () => {
    const result = parseEnv(
      makeEnv({
        BACKEND_TRUSTED_PROXIES: '172.30.10.0/29,10.0.0.10',
      }),
    );

    expect(result.BACKEND_TRUSTED_PROXIES).toEqual(['172.30.10.0/29', '10.0.0.10']);
  });

  it('parses BACKEND_TRUSTED_PROXIES=true as trust all proxies', () => {
    const result = parseEnv(makeEnv({ BACKEND_TRUSTED_PROXIES: 'true' }));

    expect(result.BACKEND_TRUSTED_PROXIES).toBe(true);
  });

  it('treats blank BACKEND_TRUSTED_PROXIES as disabled', () => {
    const result = parseEnv(makeEnv({ BACKEND_TRUSTED_PROXIES: '' }));

    expect(result.BACKEND_TRUSTED_PROXIES).toBe(false);
  });

  it('rejects invalid BACKEND_TRUSTED_PROXIES entries', () => {
    expect(() =>
      parseEnv(
        makeEnv({
          BACKEND_TRUSTED_PROXIES: '172.30.10.0/29,not-a-cidr',
        }),
      ),
    ).toThrow(/BACKEND_TRUSTED_PROXIES/);
  });

  it('rejects invalid BACKEND_TRUSTED_PROXIES CIDR prefixes', () => {
    expect(() =>
      parseEnv(
        makeEnv({
          BACKEND_TRUSTED_PROXIES: '172.30.10.0/99',
        }),
      ),
    ).toThrow(/BACKEND_TRUSTED_PROXIES/);
  });

  it('accepts explicit OpenTelemetry tracing config', () => {
    const result = parseEnv(
      makeEnv({
        OTEL_TRACES_ENABLED: 'true',
        OTEL_EXPORTER_OTLP_TRACES_ENDPOINT: 'http://otel-collector:4318/v1/traces',
        OTEL_SERVICE_NAME: 'tidda-backend',
      }),
    );

    expect(result.OTEL_TRACES_ENABLED).toBe(true);
    expect(result.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT).toBe('http://otel-collector:4318/v1/traces');
    expect(result.OTEL_SERVICE_NAME).toBe('tidda-backend');
  });

  it.each([
    { case: 'required vars are missing', input: {}, error: /Invalid environment/ },
    {
      case: 'NODE_ENV is outside the allowed set',
      input: makeEnv({ NODE_ENV: 'staging' }),
      error: /NODE_ENV/,
    },
    {
      case: 'BACKEND_PORT is not a number',
      input: makeEnv({ BACKEND_PORT: 'abc' }),
      error: /BACKEND_PORT/,
    },
    {
      case: 'BACKEND_PORT is zero or negative',
      input: makeEnv({ BACKEND_PORT: '0' }),
      error: /BACKEND_PORT/,
    },
    {
      case: 'BACKEND_PORT is above the TCP port range',
      input: makeEnv({ BACKEND_PORT: '65536' }),
      error: /BACKEND_PORT/,
    },
    {
      case: 'DATABASE_URL is not a URL',
      input: makeEnv({ DATABASE_URL: 'not-a-url' }),
      error: /DATABASE_URL/,
    },
    {
      case: 'DATABASE_URL does not use a Postgres scheme',
      input: makeEnv({ DATABASE_URL: 'https://example.com/db' }),
      error: /DATABASE_URL/,
    },
    {
      case: 'REDIS_URL is not a URL',
      input: makeEnv({ REDIS_URL: 'not-a-url' }),
      error: /REDIS_URL/,
    },
    {
      case: 'REDIS_URL does not use a Redis scheme',
      input: makeEnv({ REDIS_URL: 'https://example.com/redis' }),
      error: /REDIS_URL/,
    },
    {
      case: 'DB_POOL_MAX is zero or negative',
      input: makeEnv({ DB_POOL_MAX: '0' }),
      error: /DB_POOL_MAX/,
    },
    {
      case: 'DB_POOL_CONNECTION_TIMEOUT_MS is negative',
      input: makeEnv({ DB_POOL_CONNECTION_TIMEOUT_MS: '-1' }),
      error: /DB_POOL_CONNECTION_TIMEOUT_MS/,
    },
    {
      case: 'DB_POOL_IDLE_TIMEOUT_MS is zero or negative',
      input: makeEnv({ DB_POOL_IDLE_TIMEOUT_MS: '0' }),
      error: /DB_POOL_IDLE_TIMEOUT_MS/,
    },
    {
      case: 'SHUTDOWN_DRAIN_DELAY_MS is negative',
      input: makeEnv({ SHUTDOWN_DRAIN_DELAY_MS: '-1' }),
      error: /SHUTDOWN_DRAIN_DELAY_MS/,
    },
    {
      case: 'SHUTDOWN_TIMEOUT_MS is not larger than the drain delay',
      input: makeEnv({ SHUTDOWN_DRAIN_DELAY_MS: '3000', SHUTDOWN_TIMEOUT_MS: '3000' }),
      error: /SHUTDOWN_TIMEOUT_MS/,
    },
    {
      case: 'OTEL_TRACES_ENABLED is not true or false',
      input: makeEnv({ OTEL_TRACES_ENABLED: 'yes' }),
      error: /OTEL_TRACES_ENABLED/,
    },
    {
      case: 'OTEL_EXPORTER_OTLP_TRACES_ENDPOINT is not a URL',
      input: makeEnv({ OTEL_EXPORTER_OTLP_TRACES_ENDPOINT: 'not-a-url' }),
      error: /OTEL_EXPORTER_OTLP_TRACES_ENDPOINT/,
    },
    {
      case: 'OTEL_SERVICE_NAME is empty',
      input: makeEnv({ OTEL_SERVICE_NAME: '' }),
      error: /OTEL_SERVICE_NAME/,
    },
  ])('throws when $case', ({ input, error }) => {
    expect(() => parseEnv(input)).toThrow(error);
  });
});
