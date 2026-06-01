import { expect, it } from 'vitest';
import { z } from 'zod';
import { emptyStringToUndefined } from './helpers';

it('allows empty strings to behave like missing env values', () => {
  const OptionalUrlSchema = z.preprocess(emptyStringToUndefined, z.url().optional());

  expect(OptionalUrlSchema.parse('')).toBeUndefined();
  expect(OptionalUrlSchema.parse(undefined)).toBeUndefined();
  expect(OptionalUrlSchema.parse('https://example.com')).toBe('https://example.com');
});
