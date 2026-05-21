import { Controller, Get, UseGuards } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RateLimitGuard } from './rate-limit.guard';
import { RateLimitService } from './rate-limit.service';
import { RateLimitPolicy } from './rate-limit-policy.decorator';

@Controller()
class TestController {
  @Get('/limited')
  @RateLimitPolicy('links.create.anonymous')
  @UseGuards(RateLimitGuard)
  limited(): { ok: true } {
    return { ok: true };
  }
}

describe('RateLimitGuard', () => {
  let app: NestFastifyApplication;

  afterEach(async () => {
    await app?.close();
  });

  it('sets rate-limit headers when a request is allowed', async () => {
    const rateLimits = {
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
      controllers: [TestController],
      providers: [Reflector, RateLimitGuard, { provide: RateLimitService, useValue: rateLimits }],
    }).compile();

    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    await app.init();
    await app.getHttpAdapter().getInstance().ready();

    const res = await app.inject({ method: 'GET', url: '/limited', remoteAddress: '203.0.113.10' });

    expect(res.statusCode).toBe(200);
    expect(res.headers['x-ratelimit-limit']).toBe('10');
    expect(res.headers['x-ratelimit-remaining']).toBe('9');
    expect(res.headers['x-ratelimit-reset']).toBe('1771524477');
    expect(rateLimits.consume).toHaveBeenCalledWith({
      policyName: 'links.create.anonymous',
      identity: { kind: 'ip', value: '203.0.113.10' },
    });
  });

  it('normalises IPv6 request IPs before consuming rate-limit tokens', async () => {
    const rateLimits = {
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
      controllers: [TestController],
      providers: [Reflector, RateLimitGuard, { provide: RateLimitService, useValue: rateLimits }],
    }).compile();

    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    await app.init();
    await app.getHttpAdapter().getInstance().ready();

    const res = await app.inject({
      method: 'GET',
      url: '/limited',
      remoteAddress: '2001:db8:abcd:1234:1111:2222:3333:4444',
    });

    expect(res.statusCode).toBe(200);
    expect(rateLimits.consume).toHaveBeenCalledWith({
      policyName: 'links.create.anonymous',
      identity: { kind: 'ip', value: '2001:db8:abcd:1234::/64' },
    });
  });

  it('returns 429 and Retry-After when limited', async () => {
    const rateLimits = {
      consume: vi.fn().mockResolvedValue({
        allowed: false,
        limit: 10,
        remaining: 0,
        retryAfterSeconds: 43,
        resetAtEpochSeconds: 1_771_524_477,
        store: 'redis',
      }),
    };

    const moduleRef = await Test.createTestingModule({
      controllers: [TestController],
      providers: [Reflector, RateLimitGuard, { provide: RateLimitService, useValue: rateLimits }],
    }).compile();

    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    await app.init();
    await app.getHttpAdapter().getInstance().ready();

    const res = await app.inject({ method: 'GET', url: '/limited', remoteAddress: '203.0.113.10' });

    expect(res.statusCode).toBe(429);
    expect(res.headers['retry-after']).toBe('43');
    expect(res.json()).toEqual({
      statusCode: 429,
      error: 'Too Many Requests',
      message: 'Rate limit exceeded',
      policy: 'links.create.anonymous',
    });
  });

  it('sets fallback bucket headers when the fallback limiter rejects', async () => {
    const rateLimits = {
      consume: vi.fn().mockResolvedValue({
        allowed: false,
        limit: 2,
        remaining: 0,
        retryAfterSeconds: 30,
        resetAtEpochSeconds: 1_771_524_464,
        store: 'local_fallback',
      }),
    };

    const moduleRef = await Test.createTestingModule({
      controllers: [TestController],
      providers: [Reflector, RateLimitGuard, { provide: RateLimitService, useValue: rateLimits }],
    }).compile();

    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    await app.init();
    await app.getHttpAdapter().getInstance().ready();

    const res = await app.inject({ method: 'GET', url: '/limited', remoteAddress: '203.0.113.10' });

    expect(res.statusCode).toBe(429);
    expect(res.headers['retry-after']).toBe('30');
    expect(res.headers['x-ratelimit-limit']).toBe('2');
    expect(res.headers['x-ratelimit-remaining']).toBe('0');
    expect(res.headers['x-ratelimit-reset']).toBe('1771524464');
  });
});
