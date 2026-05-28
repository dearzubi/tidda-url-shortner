import { describe, expect, it } from 'vitest';
import {
  booleanString,
  NonEmptyStringSchema,
  PositiveNumberSchema,
  TrimmedNonEmptyStringSchema,
} from './schemas.js';

describe('schemas', () => {
  it('coerces positive integers from strings', () => {
    expect(PositiveNumberSchema.parse('25')).toBe(25);
    expect(() => PositiveNumberSchema.parse('0')).toThrow();
    expect(() => PositiveNumberSchema.parse('-1')).toThrow();
  });

  it('validates non-empty string variants', () => {
    expect(TrimmedNonEmptyStringSchema.parse(' service ')).toBe('service');
    expect(NonEmptyStringSchema.parse(' service ')).toBe(' service ');
    expect(() => TrimmedNonEmptyStringSchema.parse('   ')).toThrow();
    expect(() => NonEmptyStringSchema.parse('')).toThrow();
  });

  it('parses boolean strings with defaults', () => {
    expect(booleanString(false).parse(undefined)).toBe(false);
    expect(booleanString(true).parse(undefined)).toBe(true);
    expect(booleanString(false).parse('true')).toBe(true);
    expect(booleanString(true).parse('false')).toBe(false);
    expect(() => booleanString(false).parse('yes')).toThrow();
  });
});
