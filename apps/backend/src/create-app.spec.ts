import { describe, expect, it } from 'vitest';
import { createFastifyAdapter } from './create-app';

describe('createFastifyAdapter', () => {
  it('uses X-Forwarded-For as the request IP when the direct peer is trusted', async () => {
    const adapter = createFastifyAdapter({ trustProxy: ['172.30.10.0/29'] });
    const instance = adapter.getInstance();
    instance.get('/ip', (request, reply) => {
      reply.send({ ip: request.ip });
    });

    try {
      await instance.ready();

      const res = await instance.inject({
        method: 'GET',
        url: '/ip',
        remoteAddress: '172.30.10.2',
        headers: { 'x-forwarded-for': '203.0.113.10' },
      });

      expect(res.json()).toEqual({ ip: '203.0.113.10' });
    } finally {
      await instance.close();
    }
  });

  it('ignores X-Forwarded-For when the direct peer is not trusted', async () => {
    const adapter = createFastifyAdapter({ trustProxy: ['172.30.10.0/29'] });
    const instance = adapter.getInstance();
    instance.get('/ip', (request, reply) => {
      reply.send({ ip: request.ip });
    });

    try {
      await instance.ready();

      const res = await instance.inject({
        method: 'GET',
        url: '/ip',
        remoteAddress: '198.51.100.25',
        headers: { 'x-forwarded-for': '203.0.113.10' },
      });

      expect(res.json()).toEqual({ ip: '198.51.100.25' });
    } finally {
      await instance.close();
    }
  });
});
