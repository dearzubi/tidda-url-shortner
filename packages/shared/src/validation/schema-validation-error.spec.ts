import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { type SchemaIssue, SchemaValidationError } from './index.js';

function makeZodError(): z.ZodError {
  const result = z.object({ name: z.string() }).safeParse({});
  if (result.success) {
    throw new Error('Test setup invariant: parse should have failed');
  }
  return result.error;
}

describe('SchemaValidationError', () => {
  it('preserves contextLabel and issues passed to the constructor', () => {
    const issues: ReadonlyArray<SchemaIssue> = [
      { path: ['name'], message: 'Required', code: 'invalid_type' },
    ];
    const err = new SchemaValidationError('My label', issues, makeZodError());
    expect(err.contextLabel).toBe('My label');
    expect(err.issues).toEqual(issues);
  });

  it('sets a recognisable name and is detected via instanceof', () => {
    const err = new SchemaValidationError('label', [], makeZodError());
    expect(err.name).toBe('SchemaValidationError');
    expect(err instanceof SchemaValidationError).toBe(true);
    expect(err instanceof Error).toBe(true);
  });

  it('preserves the original ZodError as cause', () => {
    const zodErr = makeZodError();
    const err = new SchemaValidationError('label', [], zodErr);
    expect(err.cause).toBe(zodErr);
  });

  it('starts its message with the contextLabel', () => {
    const err = new SchemaValidationError('Validation failed', [], makeZodError());
    expect(err.message).toMatch(/^Validation failed:/);
  });
});
