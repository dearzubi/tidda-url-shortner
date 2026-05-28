import { z } from 'zod';

export const PositiveNumberSchema = z.coerce.number().int().positive();
export const TrimmedNonEmptyStringSchema = z.string().trim().min(1);
export const NonEmptyStringSchema = z.string().min(1);

export function booleanString(defaultValue: boolean) {
  return z
    .enum(['true', 'false'])
    .default(defaultValue ? 'true' : 'false')
    .transform((value) => value === 'true');
}
