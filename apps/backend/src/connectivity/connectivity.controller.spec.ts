import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MetricsModule } from '../metrics/metrics.module';
import { MetricsService } from '../metrics/metrics.service';
import { ConnectivityController } from './connectivity.controller';

describe('GET /status', () => {
  let app: NestFastifyApplication;
  let metrics: MetricsService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [MetricsModule],
      controllers: [ConnectivityController],
    }).compile();
    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    metrics = moduleRef.get(MetricsService);
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it('returns a stable backend connectivity payload', async () => {
    const res = await app.inject({ method: 'GET', url: '/status' });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'ok', service: 'backend' });
  });

  it('records a Prometheus counter for end-to-end checks', async () => {
    await app.inject({ method: 'GET', url: '/status' });

    const body = await metrics.scrape();

    expect(body).toContain('app_connectivity_checks_total 1');
  });
});
