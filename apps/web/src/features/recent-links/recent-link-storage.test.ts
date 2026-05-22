import type { CreateLinkResponse } from '@tidda/shared';
import { describe, expect, it } from 'vitest';
import {
  clearRecentLinks,
  loadRecentLinks,
  RECENT_LINK_LIMIT,
  saveRecentLinks,
} from './recent-link-storage.js';

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();

  get length(): number {
    return this.values.size;
  }

  clear(): void {
    this.values.clear();
  }

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  key(index: number): string | null {
    return Array.from(this.values.keys())[index] ?? null;
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

describe('recent link storage', () => {
  it('saves and loads recent links', () => {
    const storage = new MemoryStorage();
    const link = makeLink(1);

    saveRecentLinks(storage, [link]);

    expect(loadRecentLinks(storage)).toEqual([link]);
  });

  it('keeps only the newest links up to the configured limit', () => {
    const storage = new MemoryStorage();
    const newestFirstLinks = Array.from({ length: RECENT_LINK_LIMIT + 2 }, (_, index) =>
      makeLink(index),
    );

    saveRecentLinks(storage, newestFirstLinks);

    expect(loadRecentLinks(storage)).toEqual(newestFirstLinks.slice(0, RECENT_LINK_LIMIT));
  });

  it('falls back to an empty list when storage is corrupt', () => {
    const storage = new MemoryStorage();
    storage.setItem('tidda.recentLinks.v1', '{bad json');

    expect(loadRecentLinks(storage)).toEqual([]);
  });

  it('rejects stored links with unsafe short paths', () => {
    const storage = new MemoryStorage();
    storage.setItem(
      'tidda.recentLinks.v1',
      JSON.stringify([{ ...makeLink(1), shortPath: 'javascript:alert(1)' }]),
    );

    expect(loadRecentLinks(storage)).toEqual([]);
  });

  it('rejects stored links with non-web destination URLs', () => {
    const storage = new MemoryStorage();
    storage.setItem(
      'tidda.recentLinks.v1',
      JSON.stringify([{ ...makeLink(1), destinationUrl: 'data:text/html,<h1>x</h1>' }]),
    );

    expect(loadRecentLinks(storage)).toEqual([]);
  });

  it('clears recent links', () => {
    const storage = new MemoryStorage();
    saveRecentLinks(storage, [makeLink(1)]);

    clearRecentLinks(storage);

    expect(loadRecentLinks(storage)).toEqual([]);
  });
});

function makeLink(index: number): CreateLinkResponse {
  const slug = makeSlug(index);

  return {
    slug,
    shortPath: `/s/${slug}`,
    destinationUrl: `https://example.com/${index}`,
    createdAt: '2026-05-22T10:00:00.000Z',
  };
}

function makeSlug(index: number): string {
  return (100000 + index).toString();
}
