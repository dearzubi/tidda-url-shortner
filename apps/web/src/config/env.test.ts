import { describe, expect, it } from 'vitest';
import { parseEnv } from './env.js';

describe('parseEnv (web)', () => {
  it('returns a typed config when VITE_API_URL is a valid URL', () => {
    const result = parseEnv({ VITE_API_URL: 'http://localhost:3000' });
    expect(result.VITE_API_URL).toBe('http://localhost:3000');
  });

  it('defaults VITE_API_URL to the production same-origin API path', () => {
    const result = parseEnv({});

    expect(result.VITE_API_URL).toBe('/api');
  });

  it('returns a typed config when VITE_API_URL is an absolute path', () => {
    const result = parseEnv({ VITE_API_URL: '/api/v1' });

    expect(result.VITE_API_URL).toBe('/api/v1');
  });

  it('throws when VITE_API_URL is not a URL or absolute path', () => {
    expect(() => parseEnv({ VITE_API_URL: 'not a url' })).toThrow(/VITE_API_URL/);
  });

  it('throws when VITE_API_URL is a protocol-relative URL', () => {
    expect(() => parseEnv({ VITE_API_URL: '//example.com/api' })).toThrow(/VITE_API_URL/);
  });

  it('throws when VITE_API_URL uses an unsupported absolute URL scheme', () => {
    expect(() => parseEnv({ VITE_API_URL: 'ftp://example.com/api' })).toThrow(/VITE_API_URL/);
    expect(() => parseEnv({ VITE_API_URL: 'javascript:alert(1)' })).toThrow(/VITE_API_URL/);
  });

  it('throws when absolute VITE_API_URL includes query strings or fragments', () => {
    expect(() => parseEnv({ VITE_API_URL: 'https://example.com/api?token=x' })).toThrow(
      /VITE_API_URL/,
    );
    expect(() => parseEnv({ VITE_API_URL: 'https://example.com/api#status' })).toThrow(
      /VITE_API_URL/,
    );
  });
});
