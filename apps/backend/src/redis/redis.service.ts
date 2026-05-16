import { Inject, Injectable, type OnApplicationShutdown } from '@nestjs/common';
import { createClient, type RedisClientType } from 'redis';

export const REDIS_OPTIONS = Symbol('REDIS_OPTIONS');

export type RedisOptions = {
  redisUrl: string;
  connectionTimeoutMs: number;
};

@Injectable()
export class RedisService implements OnApplicationShutdown {
  private readonly client: RedisClientType;

  constructor(@Inject(REDIS_OPTIONS) options: RedisOptions) {
    this.client = createClient({
      url: options.redisUrl,
      socket: {
        connectTimeout: options.connectionTimeoutMs,
        reconnectStrategy: false,
      },
    });
    this.client.on('error', () => undefined);
  }

  getClient(): RedisClientType {
    return this.client;
  }

  createSubscriber(): RedisClientType {
    return this.client.duplicate();
  }

  async checkConnection(): Promise<void> {
    if (!this.client.isOpen) {
      await this.client.connect();
    }

    const response = await this.client.ping();
    if (response !== 'PONG') {
      throw new Error(`Unexpected Redis PING response: ${response}`);
    }
  }

  async onApplicationShutdown(): Promise<void> {
    this.client.destroy();
  }
}
