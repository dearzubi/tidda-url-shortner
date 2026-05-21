import { Injectable, type OnModuleInit } from '@nestjs/common';
import { REDIS_TOKEN_BUCKET_SCRIPT } from './redis-token-bucket.script';

export type RedisScriptLoaderClient = {
  scriptLoad(script: string): Promise<string>;
};

export type RedisScriptClientProvider = {
  getOpenClient(): Promise<RedisScriptLoaderClient>;
};

@Injectable()
export class RedisTokenBucketScriptLoader implements OnModuleInit {
  private scriptSha: string | undefined;
  private loadPromise: Promise<string> | undefined;

  constructor(private readonly redis: RedisScriptClientProvider) {}

  async onModuleInit(): Promise<void> {
    try {
      const client = await this.redis.getOpenClient();
      await this.getScriptSha(client);
    } catch {
      this.clearScriptSha();
    }
  }

  async getScriptSha(client: RedisScriptLoaderClient): Promise<string> {
    if (this.scriptSha) {
      return this.scriptSha;
    }

    this.loadPromise ??= client
      .scriptLoad(REDIS_TOKEN_BUCKET_SCRIPT)
      .then((sha) => {
        this.scriptSha = sha;
        return sha;
      })
      .finally(() => {
        this.loadPromise = undefined;
      });
    return this.loadPromise;
  }

  clearScriptSha(): void {
    this.scriptSha = undefined;
    this.loadPromise = undefined;
  }
}
