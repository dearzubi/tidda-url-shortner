import { describe, expect, it } from 'vitest';
import { apiUrl, shortUrlFromPath } from './api-url.js';

describe('apiUrl', () => {
  it('joins same-origin API paths without duplicate slashes', () => {
    expect(apiUrl('/api', '/links')).toBe('/api/links');
    expect(apiUrl('/api/', '/links')).toBe('/api/links');
  });

  it('joins absolute API URLs without duplicate slashes', () => {
    expect(apiUrl('https://tidda.example/api/', '/links')).toBe('https://tidda.example/api/links');
  });

  it('rejects absolute API base URLs with query strings or hash fragments', () => {
    expect(() => apiUrl('https://tidda.example/api?token=public', '/links')).toThrow(/apiBaseUrl/);
    expect(() => apiUrl('https://tidda.example/api#links', '/links')).toThrow(/apiBaseUrl/);
  });

  it('rejects unsupported absolute API base URL schemes', () => {
    expect(() => apiUrl('ftp://tidda.example/api', '/links')).toThrow(/apiBaseUrl/);
    expect(() => apiUrl('javascript:alert(1)', '/links')).toThrow(/apiBaseUrl/);
  });

  it('rejects paths that are not same-origin absolute paths', () => {
    expect(() => apiUrl('/api', 'https://other.example/links')).toThrow(/path/);
    expect(() => apiUrl('/api', '//other.example/links')).toThrow(/path/);
  });
});

describe('shortUrlFromPath', () => {
  it('derives a full same-origin short URL', () => {
    expect(shortUrlFromPath('https://tidda.example', '/s/100000')).toBe(
      'https://tidda.example/s/100000',
    );
  });

  it('rejects paths that are not same-origin absolute paths', () => {
    expect(() =>
      shortUrlFromPath('https://tidda.example', 'https://other.example/s/100000'),
    ).toThrow(/shortPath/);
  });
});
