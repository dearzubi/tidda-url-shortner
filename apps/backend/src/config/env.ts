import {
  booleanString,
  emptyStringToUndefined,
  NonEmptyStringSchema,
  PositiveNumberSchema,
  parseSchema,
  TrimmedNonEmptyStringSchema,
} from '@tidda/shared';
import ipaddr from 'ipaddr.js';
import { z } from 'zod';

export const TcpPortSchema = PositiveNumberSchema.min(1).max(65535);

function protocolIsOneOf(protocols: string[]) {
  const normalisedProtocols = protocols.map((protocol) => protocol.toLowerCase());

  return function hasExpectedProtocol(value: string): boolean {
    try {
      return normalisedProtocols.includes(new URL(value).protocol);
    } catch {
      return false;
    }
  };
}

export function urlWithProtocols(protocols: string[], message: string) {
  return z.url().refine(protocolIsOneOf(protocols), { message });
}

function isHostValue(value: string): boolean {
  try {
    const url = new URL(`scheme://${value}`);

    return (
      url.hostname.length > 0 &&
      url.port === '' &&
      url.username === '' &&
      url.password === '' &&
      (url.pathname === '' || url.pathname === '/') &&
      url.search === '' &&
      url.hash === ''
    );
  } catch {
    return false;
  }
}

export const HostWithoutPortSchema = TrimmedNonEmptyStringSchema.refine(isHostValue, {
  message: 'Host must be a hostname or IP address without scheme, port, path, or credentials',
});

function missingEnvUrl() {
  return z.preprocess(emptyStringToUndefined, z.undefined().optional());
}

function stripTrailingSlash(value: string): string {
  return value.endsWith('/') ? value.slice(0, -1) : value;
}

const DatabaseUrlSchema = urlWithProtocols(
  ['postgres:', 'postgresql:'],
  'DATABASE_URL must use postgres:// or postgresql://',
).transform(stripTrailingSlash);

const RedisUrlSchema = urlWithProtocols(
  ['redis:', 'rediss:'],
  'REDIS_URL must use redis:// or rediss://',
).transform(stripTrailingSlash);

const DatabaseUrlSourceSchema = z.object({
  DATABASE_URL: z.preprocess(emptyStringToUndefined, DatabaseUrlSchema),
});

const DatabasePartsInputSchema = z.object({
  DATABASE_URL: missingEnvUrl(),
  DATABASE_HOST: HostWithoutPortSchema,
  DATABASE_PORT: TcpPortSchema.default(5432),
  DATABASE_NAME: TrimmedNonEmptyStringSchema,
  DATABASE_USER: TrimmedNonEmptyStringSchema,
  DATABASE_PASSWORD: NonEmptyStringSchema,
});

const DatabasePartsSourceSchema = DatabasePartsInputSchema.transform((source) => ({
  DATABASE_URL: buildDatabaseUrl(source),
}));

const DatabaseSourceSchema = z.union([DatabaseUrlSourceSchema, DatabasePartsSourceSchema]);

const RedisUrlSourceSchema = z.object({
  REDIS_URL: z.preprocess(emptyStringToUndefined, RedisUrlSchema),
});

const RedisPartsInputSchema = z.object({
  REDIS_URL: missingEnvUrl(),
  REDIS_HOST: HostWithoutPortSchema,
  REDIS_PORT: TcpPortSchema.default(6379),
  REDIS_PASSWORD: z.string().optional(),
  REDIS_TLS: booleanString(false),
});

const RedisPartsSourceSchema = RedisPartsInputSchema.transform((source) => ({
  REDIS_URL: buildRedisUrl(source),
}));

const RedisSourceSchema = z.union([RedisUrlSourceSchema, RedisPartsSourceSchema]);

type DatabaseUrlParts = z.infer<typeof DatabasePartsInputSchema>;

type RedisUrlParts = z.infer<typeof RedisPartsInputSchema>;

function buildDatabaseUrl(source: DatabaseUrlParts): string {
  const url = new URL(`postgres://${source.DATABASE_HOST}`);
  url.port = source.DATABASE_PORT.toString();
  url.pathname = source.DATABASE_NAME;
  url.username = source.DATABASE_USER;
  url.password = source.DATABASE_PASSWORD;

  return stripTrailingSlash(url.toString());
}

function buildRedisUrl(source: RedisUrlParts): string {
  const scheme = source.REDIS_TLS ? 'rediss' : 'redis';
  const url = new URL(`${scheme}://${source.REDIS_HOST}`);
  url.port = source.REDIS_PORT.toString();

  if (source.REDIS_PASSWORD && source.REDIS_PASSWORD.length > 0) {
    url.username = '';
    url.password = source.REDIS_PASSWORD;
  }

  return stripTrailingSlash(url.toString());
}

function parseTrustedProxies(value: string): false | true | string[] {
  if (value === '' || value === 'false') {
    return false;
  }

  if (value === 'true') {
    return true;
  }

  const proxies = value
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);

  return proxies.length === 0 ? false : proxies;
}

function isTrustedProxyEntry(value: string): boolean {
  try {
    if (value.includes('/')) {
      ipaddr.parseCIDR(value);
      return true;
    }

    ipaddr.parse(value);
    return true;
  } catch {
    return false;
  }
}

const TrustedProxyEntrySchema = TrimmedNonEmptyStringSchema.refine(isTrustedProxyEntry, {
  message: 'BACKEND_TRUSTED_PROXIES entries must be valid IP addresses or CIDR ranges',
});

const TrustedProxiesSchema = z
  .string()
  .trim()
  .default('')
  .transform(parseTrustedProxies)
  .pipe(z.union([z.literal(false), z.literal(true), z.array(TrustedProxyEntrySchema)]));

const BaseEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']),
  BACKEND_PORT: TcpPortSchema,
  BACKEND_TRUSTED_PROXIES: TrustedProxiesSchema,
  DATABASE_NAME: TrimmedNonEmptyStringSchema.optional(),
  DATABASE_USER: TrimmedNonEmptyStringSchema.optional(),
  DATABASE_PASSWORD: NonEmptyStringSchema.optional(),
  DATABASE_ADMIN_USER: TrimmedNonEmptyStringSchema.optional(),
  DATABASE_ADMIN_PASSWORD: NonEmptyStringSchema.optional(),
  DATABASE_SCHEMA: TrimmedNonEmptyStringSchema.default('public'),
  DATABASE_SSL: booleanString(false),
  DATABASE_SSL_CA_FILE: TrimmedNonEmptyStringSchema.optional(),
  DB_POOL_MAX: PositiveNumberSchema.default(10),
  DB_POOL_CONNECTION_TIMEOUT_MS: PositiveNumberSchema.default(5000),
  DB_POOL_IDLE_TIMEOUT_MS: PositiveNumberSchema.default(30000),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).optional(),
  SHUTDOWN_DRAIN_DELAY_MS: PositiveNumberSchema.default(3000),
  SHUTDOWN_TIMEOUT_MS: PositiveNumberSchema.default(25000),
  OTEL_TRACES_ENABLED: booleanString(false),
  OTEL_EXPORTER_OTLP_TRACES_ENDPOINT: z.url().default('http://localhost:4318/v1/traces'),
  OTEL_SERVICE_NAME: TrimmedNonEmptyStringSchema.default('backend'),
});

const EnvSchema = BaseEnvSchema.and(DatabaseSourceSchema)
  .and(RedisSourceSchema)
  .refine((env) => env.SHUTDOWN_TIMEOUT_MS > env.SHUTDOWN_DRAIN_DELAY_MS, {
    message: 'SHUTDOWN_TIMEOUT_MS must be larger than SHUTDOWN_DRAIN_DELAY_MS',
    path: ['SHUTDOWN_TIMEOUT_MS'],
  });

export type Env = z.infer<typeof EnvSchema>;

export type EnvSource = Partial<Record<string, string | undefined>>;

export function parseEnv(source: EnvSource): Env {
  return parseSchema(EnvSchema, source, 'Invalid environment');
}

export function loadEnv(): Env {
  return parseEnv(process.env);
}
