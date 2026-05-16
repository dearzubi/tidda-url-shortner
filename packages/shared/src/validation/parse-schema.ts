import type { z } from 'zod';
import { type SchemaIssue, SchemaValidationError } from './schema-validation-error.js';

export function parseSchema<T extends z.ZodType>(
  schema: T,
  source: unknown,
  contextLabel: string,
): z.infer<T> {
  const result = schema.safeParse(source);
  if (!result.success) {
    const issues: ReadonlyArray<SchemaIssue> = result.error.issues.map((i) => ({
      path: i.path.map((segment) => (typeof segment === 'symbol' ? segment.toString() : segment)),
      message: i.message,
      code: i.code,
    }));
    throw new SchemaValidationError(contextLabel, issues, result.error);
  }
  return result.data;
}
