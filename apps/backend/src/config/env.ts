import { parseSchema } from '@template/shared';
import { z } from 'zod';

const BooleanStringSchema = z.preprocess(
  (value) => value ?? 'false',
  z.enum(['true', 'false']).transform((value) => value === 'true'),
);
const TcpPortSchema = z.coerce.number().int().min(1).max(65535);

const EnvSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']),
    BACKEND_PORT: TcpPortSchema,
    DATABASE_URL: z
      .url()
      .refine((url) => url.startsWith('postgres://') || url.startsWith('postgresql://'), {
        message: 'DATABASE_URL must use postgres:// or postgresql://',
      }),
    REDIS_URL: z.url().refine((url) => url.startsWith('redis://') || url.startsWith('rediss://'), {
      message: 'REDIS_URL must use redis:// or rediss://',
    }),
    DB_POOL_MAX: z.coerce.number().int().positive().default(10),
    DB_POOL_CONNECTION_TIMEOUT_MS: z.coerce.number().int().min(0).default(5000),
    DB_POOL_IDLE_TIMEOUT_MS: z.coerce.number().int().positive().default(30000),
    LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).optional(),
    SHUTDOWN_DRAIN_DELAY_MS: z.coerce.number().int().min(0).default(3000),
    SHUTDOWN_TIMEOUT_MS: z.coerce.number().int().positive().default(25000),
    OTEL_TRACES_ENABLED: BooleanStringSchema,
    OTEL_EXPORTER_OTLP_TRACES_ENDPOINT: z.url().default('http://localhost:4318/v1/traces'),
    OTEL_SERVICE_NAME: z.string().trim().min(1).default('backend'),
  })
  .refine((env) => env.SHUTDOWN_TIMEOUT_MS > env.SHUTDOWN_DRAIN_DELAY_MS, {
    message: 'SHUTDOWN_TIMEOUT_MS must be larger than SHUTDOWN_DRAIN_DELAY_MS',
    path: ['SHUTDOWN_TIMEOUT_MS'],
  });

export type Env = z.infer<typeof EnvSchema>;

export function parseEnv(source: NodeJS.ProcessEnv | Record<string, string | undefined>): Env {
  return parseSchema(EnvSchema, source, 'Invalid environment');
}

export function loadEnv(): Env {
  return parseEnv(process.env);
}
