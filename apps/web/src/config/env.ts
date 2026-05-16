import { parseSchema } from '@template/shared';
import { z } from 'zod';

const ApiUrlSchema = z
  .union([
    z.url(),
    z.string().regex(/^\/(?!\/)[A-Za-z0-9/_-]*$/, 'VITE_API_URL must be a URL or absolute path'),
  ])
  .default('/api');

const EnvSchema = z.object({
  VITE_API_URL: ApiUrlSchema,
});

export type Env = z.infer<typeof EnvSchema>;

export function parseEnv(source: Record<string, string | undefined>): Env {
  return parseSchema(EnvSchema, source, 'Invalid environment');
}

export const env: Env = parseEnv(import.meta.env);
