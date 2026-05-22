import { describe, expect, it, vi } from 'vitest';
import { createLink, LinkApiError } from './link-api.js';

describe('createLink', () => {
  it('posts the destination URL and parses the response', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          slug: '100000',
          shortPath: '/s/100000',
          destinationUrl: 'https://example.com/a',
          createdAt: '2026-05-22T10:00:00.000Z',
        }),
        { status: 201, headers: { 'content-type': 'application/json' } },
      ),
    );

    const result = await createLink({
      apiBaseUrl: '/api',
      destinationUrl: 'https://example.com/a',
      fetcher,
    });

    expect(fetcher).toHaveBeenCalledWith('/api/links', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ destinationUrl: 'https://example.com/a' }),
    });
    expect(result.shortPath).toBe('/s/100000');
  });

  it('maps validation responses to typed validation errors', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ status: 'bad_request' }), {
        status: 400,
      }),
    );

    await expect(
      createLink({
        apiBaseUrl: '/api',
        destinationUrl: 'not-a-url',
        fetcher,
      }),
    ).rejects.toMatchObject({
      kind: 'validation',
      retryAfterSeconds: null,
    });
  });

  it('maps rate-limit responses with retry timing', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ status: 'rate_limited' }), {
        status: 429,
        headers: { 'retry-after': '42' },
      }),
    );

    await expect(
      createLink({
        apiBaseUrl: '/api',
        destinationUrl: 'https://example.com/a',
        fetcher,
      }),
    ).rejects.toMatchObject({
      kind: 'rate_limited',
      retryAfterSeconds: 42,
    });
  });

  it('maps network fetch errors to typed network errors', async () => {
    const fetcher = vi.fn<typeof fetch>().mockRejectedValue(new TypeError('Failed to fetch'));

    await expect(
      createLink({
        apiBaseUrl: '/api',
        destinationUrl: 'https://example.com/a',
        fetcher,
      }),
    ).rejects.toMatchObject({
      kind: 'network',
      retryAfterSeconds: null,
    });
  });

  it('rejects invalid response shapes', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(JSON.stringify({ slug: 'bad' }), { status: 201 }));

    await expect(
      createLink({
        apiBaseUrl: '/api',
        destinationUrl: 'https://example.com/a',
        fetcher,
      }),
    ).rejects.toBeInstanceOf(LinkApiError);
  });

  it('maps invalid JSON success responses to typed unexpected errors', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response('{bad json', { status: 201 }));

    await expect(
      createLink({
        apiBaseUrl: '/api',
        destinationUrl: 'https://example.com/a',
        fetcher,
      }),
    ).rejects.toMatchObject({
      kind: 'unexpected',
    });
  });

  it('maps empty success responses to typed unexpected errors', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response('', { status: 201 }));

    await expect(
      createLink({
        apiBaseUrl: '/api',
        destinationUrl: 'https://example.com/a',
        fetcher,
      }),
    ).rejects.toMatchObject({
      kind: 'unexpected',
    });
  });
});
