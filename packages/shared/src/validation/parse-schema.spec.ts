import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { parseSchema, SchemaValidationError } from './index.js';

describe('parseSchema', () => {
  it('returns typed data when input matches the schema', () => {
    const Schema = z.object({ name: z.string(), age: z.number() });
    const result = parseSchema(Schema, { name: 'Example', age: 1 }, 'Bad input');
    expect(result).toEqual({ name: 'Example', age: 1 });
  });

  it('throws SchemaValidationError on failure', () => {
    const Schema = z.object({ name: z.string() });
    expect(() => parseSchema(Schema, {}, 'Bad input')).toThrow(SchemaValidationError);
  });

  it('captures structured issues including path and code', () => {
    const Schema = z.object({ name: z.string() });
    let caught: unknown;
    try {
      parseSchema(Schema, {}, 'Bad input');
    } catch (err) {
      caught = err;
    }
    if (!(caught instanceof SchemaValidationError)) {
      throw new Error('Expected SchemaValidationError');
    }
    expect(caught.contextLabel).toBe('Bad input');
    expect(caught.issues).toHaveLength(1);
    expect(caught.issues[0]?.path).toEqual(['name']);
    expect(caught.issues[0]?.code).toBe('invalid_type');
  });

  it('preserves the original ZodError as cause', () => {
    const Schema = z.string();
    let caught: unknown;
    try {
      parseSchema(Schema, 42, 'Bad input');
    } catch (err) {
      caught = err;
    }
    if (!(caught instanceof SchemaValidationError)) {
      throw new Error('Expected SchemaValidationError');
    }
    expect(caught.cause).toBeInstanceOf(z.ZodError);
  });
});
