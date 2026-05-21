import { describe, expect, it } from 'vitest';
import {
  CreateLinkRequestSchema,
  CreateLinkResponseSchema,
  GENERATED_LINK_SLUG_PATTERN,
  LinkSlugSchema,
} from './link.schema.js';

describe('link API schemas', () => {
  it('accepts http and https destination URLs', () => {
    expect(CreateLinkRequestSchema.parse({ destinationUrl: 'https://example.com/a' })).toEqual({
      destinationUrl: 'https://example.com/a',
    });
    expect(CreateLinkRequestSchema.parse({ destinationUrl: 'http://example.com/a' })).toEqual({
      destinationUrl: 'http://example.com/a',
    });
  });

  it('rejects non-http destination URLs', () => {
    expect(() => CreateLinkRequestSchema.parse({ destinationUrl: 'ftp://example.com/a' })).toThrow(
      /http and https/i,
    );
    expect(() => CreateLinkRequestSchema.parse({ destinationUrl: 'javascript:alert(1)' })).toThrow(
      /http and https/i,
    );
  });

  it('accepts the generated slug format', () => {
    expect(LinkSlugSchema.parse('100000')).toBe('100000');
    expect(LinkSlugSchema.parse('Ab3dEf91')).toBe('Ab3dEf91');
  });

  it('exports the generated slug pattern used by backend tests', () => {
    expect(GENERATED_LINK_SLUG_PATTERN.test('100000')).toBe(true);
    expect(GENERATED_LINK_SLUG_PATTERN.test('abcd_123')).toBe(false);
  });

  it('rejects malformed slugs', () => {
    expect(() => LinkSlugSchema.parse('abc')).toThrow();
    expect(() => LinkSlugSchema.parse('abcd_123')).toThrow();
    expect(() => LinkSlugSchema.parse('a'.repeat(13))).toThrow();
  });

  it('accepts create-link responses', () => {
    expect(
      CreateLinkResponseSchema.parse({
        slug: '100000',
        shortPath: '/s/100000',
        destinationUrl: 'https://example.com/a',
        createdAt: '2026-05-19T12:00:00.000Z',
      }),
    ).toEqual({
      slug: '100000',
      shortPath: '/s/100000',
      destinationUrl: 'https://example.com/a',
      createdAt: '2026-05-19T12:00:00.000Z',
    });
  });
});
