import { parseSchema } from '@tidda/shared';
import { z } from 'zod';

const AbsoluteHttpApiUrlSchema = z.url({ protocol: /^https?$/ }).refine((value) => {
  try {
    const parsed = new URL(value);
    return parsed.search === '' && parsed.hash === '';
  } catch {
    return false;
  }
}, 'VITE_API_URL must not include a query string or hash fragment');

const SameOriginApiPathSchema = z
  .string()
  .regex(/^\/(?!\/)[A-Za-z0-9/_-]*$/, 'VITE_API_URL must be a URL or absolute path');

const ApiUrlSchema = z.union([AbsoluteHttpApiUrlSchema, SameOriginApiPathSchema]).default('/api');

const EnvSchema = z.object({
  VITE_API_URL: ApiUrlSchema,
});

export type Env = z.infer<typeof EnvSchema>;

export function parseEnv(source: Record<string, string | undefined>): Env {
  return parseSchema(EnvSchema, source, 'Invalid environment');
}

export const env: Env = parseEnv(import.meta.env);
