import { Reflector } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LinkService } from '../link/link.service';
import { RateLimitGuard } from '../rate-limit/rate-limit.guard';
import { RateLimitService } from '../rate-limit/rate-limit.service';
import { LinksController } from './links.controller';

describe('LinksController', () => {
  let app: NestFastifyApplication;
  let service: {
    createLink: ReturnType<typeof vi.fn>;
    resolveLink: ReturnType<typeof vi.fn>;
  };
  let rateLimits: {
    consume: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    service = {
      createLink: vi.fn().mockResolvedValue({
        id: '1c78fd52-ff7f-455d-9c08-3f530ea9c8d1',
        slug: '100000',
        destinationUrl: 'https://example.com/a',
        createdAt: new Date('2026-05-19T12:00:00.000Z'),
      }),
      resolveLink: vi.fn().mockResolvedValue({
        id: '1c78fd52-ff7f-455d-9c08-3f530ea9c8d1',
        slug: '100000',
        destinationUrl: 'https://example.com/a',
        createdAt: new Date('2026-05-19T12:00:00.000Z'),
      }),
    };
    rateLimits = {
      consume: vi.fn().mockResolvedValue({
        allowed: true,
        limit: 10,
        remaining: 9,
        retryAfterSeconds: 0,
        resetAtEpochSeconds: 1_771_524_477,
        store: 'redis',
      }),
    };

    const moduleRef = await Test.createTestingModule({
      controllers: [LinksController],
      providers: [
        Reflector,
        RateLimitGuard,
        { provide: LinkService, useValue: service },
        { provide: RateLimitService, useValue: rateLimits },
      ],
    }).compile();

    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it('creates a generated short link', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/links',
      remoteAddress: '203.0.113.10',
      payload: { destinationUrl: 'https://example.com/a' },
    });

    expect(res.statusCode).toBe(201);
    expect(res.json()).toEqual({
      slug: '100000',
      shortPath: '/100000',
      destinationUrl: 'https://example.com/a',
      createdAt: '2026-05-19T12:00:00.000Z',
    });
    expect(rateLimits.consume).toHaveBeenCalledWith({
      policyName: 'links.create.anonymous',
      identity: { kind: 'ip', value: '203.0.113.10' },
    });
    expect(service.createLink).toHaveBeenCalledWith({ destinationUrl: 'https://example.com/a' });
  });

  it('rate limits anonymous link creation before creating a link', async () => {
    rateLimits.consume.mockResolvedValueOnce({
      allowed: false,
      limit: 10,
      remaining: 0,
      retryAfterSeconds: 43,
      resetAtEpochSeconds: 1_771_524_477,
      store: 'redis',
    });

    const res = await app.inject({
      method: 'POST',
      url: '/links',
      remoteAddress: '203.0.113.10',
      payload: { destinationUrl: 'https://example.com/a' },
    });

    expect(res.statusCode).toBe(429);
    expect(res.headers['retry-after']).toBe('43');
    expect(res.headers['x-ratelimit-limit']).toBe('10');
    expect(res.headers['x-ratelimit-remaining']).toBe('0');
    expect(res.headers['x-ratelimit-reset']).toBe('1771524477');
    expect(service.createLink).not.toHaveBeenCalled();
  });

  it('rate limits malformed anonymous link creation attempts before body validation', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/links',
      remoteAddress: '203.0.113.10',
      payload: { destinationUrl: 'ftp://example.com/a' },
    });

    expect(res.statusCode).toBe(400);
    expect(rateLimits.consume).toHaveBeenCalledWith({
      policyName: 'links.create.anonymous',
      identity: { kind: 'ip', value: '203.0.113.10' },
    });
    expect(service.createLink).not.toHaveBeenCalled();
  });

  it('rejects unsupported destination schemes', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/links',
      payload: { destinationUrl: 'ftp://example.com/a' },
    });

    expect(res.statusCode).toBe(400);
    expect(service.createLink).not.toHaveBeenCalled();
  });

  it('redirects a stored slug to its destination URL', async () => {
    const res = await app.inject({ method: 'GET', url: '/100000' });

    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe('https://example.com/a');
  });

  it('returns 404 for a missing slug', async () => {
    service.resolveLink.mockResolvedValue(null);

    const res = await app.inject({ method: 'GET', url: '/Missing' });

    expect(res.statusCode).toBe(404);
  });
});
