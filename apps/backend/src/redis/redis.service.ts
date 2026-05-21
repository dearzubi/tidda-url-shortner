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
  private connectPromise: Promise<RedisClientType> | undefined;

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

  async getOpenClient(): Promise<RedisClientType> {
    if (this.client.isOpen) {
      return this.client;
    }

    this.connectPromise ??= this.client
      .connect()
      .then(() => this.client)
      .finally(() => {
        this.connectPromise = undefined;
      });
    return this.connectPromise;
  }

  createSubscriber(): RedisClientType {
    return this.client.duplicate();
  }

  async checkConnection(): Promise<void> {
    const client = await this.getOpenClient();
    const response = await client.ping();
    if (response !== 'PONG') {
      throw new Error(`Unexpected Redis PING response: ${response}`);
    }
  }

  async onApplicationShutdown(): Promise<void> {
    this.client.destroy();
  }
}
