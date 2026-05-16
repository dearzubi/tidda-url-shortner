import { describe, expect, it } from 'vitest';
import { parseEnv } from './env';

const validEnv = {
  NODE_ENV: 'development',
  BACKEND_PORT: '3000',
  DATABASE_URL: 'postgres://u:p@localhost:5432/db',
  REDIS_URL: 'redis://localhost:6379',
};

function expectPositiveNumber(v: number) {
  expect(v).toBeGreaterThan(0);
}

describe('parseEnv', () => {
  it('returns a typed config when all required vars are present', () => {
    const result = parseEnv(validEnv);
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
    const result = parseEnv({
      ...validEnv,
      DB_POOL_MAX: '20',
      DB_POOL_CONNECTION_TIMEOUT_MS: '2500',
      DB_POOL_IDLE_TIMEOUT_MS: '15000',
    });

    expect(result.DB_POOL_MAX).toBe(20);
    expect(result.DB_POOL_CONNECTION_TIMEOUT_MS).toBe(2500);
    expect(result.DB_POOL_IDLE_TIMEOUT_MS).toBe(15000);
  });

  it('accepts explicit graceful shutdown timings', () => {
    const result = parseEnv({
      ...validEnv,
      SHUTDOWN_DRAIN_DELAY_MS: '5000',
      SHUTDOWN_TIMEOUT_MS: '45000',
    });

    expect(result.SHUTDOWN_DRAIN_DELAY_MS).toBe(5000);
    expect(result.SHUTDOWN_TIMEOUT_MS).toBe(45000);
  });

  it('accepts explicit OpenTelemetry tracing config', () => {
    const result = parseEnv({
      ...validEnv,
      OTEL_TRACES_ENABLED: 'true',
      OTEL_EXPORTER_OTLP_TRACES_ENDPOINT: 'http://otel-collector:4318/v1/traces',
      OTEL_SERVICE_NAME: 'template-backend',
    });

    expect(result.OTEL_TRACES_ENABLED).toBe(true);
    expect(result.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT).toBe('http://otel-collector:4318/v1/traces');
    expect(result.OTEL_SERVICE_NAME).toBe('template-backend');
  });

  it.each([
    { case: 'required vars are missing', input: {}, error: /Invalid environment/ },
    {
      case: 'NODE_ENV is outside the allowed set',
      input: { ...validEnv, NODE_ENV: 'staging' },
      error: /NODE_ENV/,
    },
    {
      case: 'BACKEND_PORT is not a number',
      input: { ...validEnv, BACKEND_PORT: 'abc' },
      error: /BACKEND_PORT/,
    },
    {
      case: 'BACKEND_PORT is zero or negative',
      input: { ...validEnv, BACKEND_PORT: '0' },
      error: /BACKEND_PORT/,
    },
    {
      case: 'BACKEND_PORT is above the TCP port range',
      input: { ...validEnv, BACKEND_PORT: '65536' },
      error: /BACKEND_PORT/,
    },
    {
      case: 'DATABASE_URL is not a URL',
      input: { ...validEnv, DATABASE_URL: 'not-a-url' },
      error: /DATABASE_URL/,
    },
    {
      case: 'DATABASE_URL does not use a Postgres scheme',
      input: { ...validEnv, DATABASE_URL: 'https://example.com/db' },
      error: /DATABASE_URL/,
    },
    {
      case: 'REDIS_URL is not a URL',
      input: { ...validEnv, REDIS_URL: 'not-a-url' },
      error: /REDIS_URL/,
    },
    {
      case: 'REDIS_URL does not use a Redis scheme',
      input: { ...validEnv, REDIS_URL: 'https://example.com/redis' },
      error: /REDIS_URL/,
    },
    {
      case: 'DB_POOL_MAX is zero or negative',
      input: { ...validEnv, DB_POOL_MAX: '0' },
      error: /DB_POOL_MAX/,
    },
    {
      case: 'DB_POOL_CONNECTION_TIMEOUT_MS is negative',
      input: { ...validEnv, DB_POOL_CONNECTION_TIMEOUT_MS: '-1' },
      error: /DB_POOL_CONNECTION_TIMEOUT_MS/,
    },
    {
      case: 'DB_POOL_IDLE_TIMEOUT_MS is zero or negative',
      input: { ...validEnv, DB_POOL_IDLE_TIMEOUT_MS: '0' },
      error: /DB_POOL_IDLE_TIMEOUT_MS/,
    },
    {
      case: 'SHUTDOWN_DRAIN_DELAY_MS is negative',
      input: { ...validEnv, SHUTDOWN_DRAIN_DELAY_MS: '-1' },
      error: /SHUTDOWN_DRAIN_DELAY_MS/,
    },
    {
      case: 'SHUTDOWN_TIMEOUT_MS is not larger than the drain delay',
      input: { ...validEnv, SHUTDOWN_DRAIN_DELAY_MS: '3000', SHUTDOWN_TIMEOUT_MS: '3000' },
      error: /SHUTDOWN_TIMEOUT_MS/,
    },
    {
      case: 'OTEL_TRACES_ENABLED is not true or false',
      input: { ...validEnv, OTEL_TRACES_ENABLED: 'yes' },
      error: /OTEL_TRACES_ENABLED/,
    },
    {
      case: 'OTEL_EXPORTER_OTLP_TRACES_ENDPOINT is not a URL',
      input: { ...validEnv, OTEL_EXPORTER_OTLP_TRACES_ENDPOINT: 'not-a-url' },
      error: /OTEL_EXPORTER_OTLP_TRACES_ENDPOINT/,
    },
    {
      case: 'OTEL_SERVICE_NAME is empty',
      input: { ...validEnv, OTEL_SERVICE_NAME: '' },
      error: /OTEL_SERVICE_NAME/,
    },
  ])('throws when $case', ({ input, error }) => {
    expect(() => parseEnv(input)).toThrow(error);
  });
});
