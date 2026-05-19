import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LinkService } from '../link/link.service';
import { LinksController } from './links.controller';

describe('LinksController', () => {
  let app: NestFastifyApplication;
  let service: {
    createLink: ReturnType<typeof vi.fn>;
    resolveLink: ReturnType<typeof vi.fn>;
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

    const moduleRef = await Test.createTestingModule({
      controllers: [LinksController],
      providers: [{ provide: LinkService, useValue: service }],
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
      payload: { destinationUrl: 'https://example.com/a' },
    });

    expect(res.statusCode).toBe(201);
    expect(res.json()).toEqual({
      slug: '100000',
      shortPath: '/100000',
      destinationUrl: 'https://example.com/a',
      createdAt: '2026-05-19T12:00:00.000Z',
    });
    expect(service.createLink).toHaveBeenCalledWith({ destinationUrl: 'https://example.com/a' });
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
