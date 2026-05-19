import { describe, expect, it } from 'vitest';
import { LINK_SLUG_COUNTER_START } from '../db/link-slug-counter';
import {
  encodeBase62Counter,
  isGeneratedSlug,
  isReservedSlug,
  RESERVED_SLUGS,
  SLUG_ALPHABET,
} from './slug';

describe('encodeBase62Counter', () => {
  it('encodes the first allocated counter as a six-character slug', () => {
    expect(encodeBase62Counter(LINK_SLUG_COUNTER_START)).toBe('100000');
  });

  it('encodes larger counters without truncation', () => {
    expect(encodeBase62Counter(20_000_000_000n)).toBe('LpVxdA');
  });

  it('rejects counters below the configured start', () => {
    expect(() => encodeBase62Counter(LINK_SLUG_COUNTER_START - 1n)).toThrow(
      /must be greater than or equal/i,
    );
  });

  it('recognises generated slug syntax', () => {
    expect(isGeneratedSlug('100000')).toBe(true);
    expect(isGeneratedSlug('LpVxdA')).toBe(true);
  });

  it('rejects malformed slugs', () => {
    expect(isGeneratedSlug('abc')).toBe(false);
    expect(isGeneratedSlug('abcd_123')).toBe(false);
    expect(isGeneratedSlug('abcd-123')).toBe(false);
    expect(isGeneratedSlug('a'.repeat(13))).toBe(false);
  });

  it('recognises reserved application paths', () => {
    for (const slug of RESERVED_SLUGS) {
      expect(isReservedSlug(slug)).toBe(true);
    }
    expect(isReservedSlug('100000')).toBe(false);
  });

  it('uses the expected Base62 alphabet', () => {
    expect(SLUG_ALPHABET).toBe('0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz');
  });
});
