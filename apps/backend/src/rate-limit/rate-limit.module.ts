import { Module } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';
import { LocalTokenBucketStore } from './local-token-bucket.store';
import { RateLimitGuard } from './rate-limit.guard';
import {
  LOCAL_RATE_LIMIT_STORE,
  RateLimitService,
  REDIS_RATE_LIMIT_STORE,
} from './rate-limit.service';
import { RedisTokenBucketStore } from './redis-token-bucket.store';
import { RedisTokenBucketScriptLoader } from './redis-token-bucket-script.loader';

@Module({
  providers: [
    RateLimitGuard,
    RateLimitService,
    RedisTokenBucketScriptLoader,
    { provide: LOCAL_RATE_LIMIT_STORE, useFactory: () => new LocalTokenBucketStore() },
    {
      provide: REDIS_RATE_LIMIT_STORE,
      inject: [RedisService, RedisTokenBucketScriptLoader],
      useFactory: (redis: RedisService, scripts: RedisTokenBucketScriptLoader) =>
        new RedisTokenBucketStore(redis, scripts),
    },
  ],
  exports: [RateLimitGuard, RateLimitService],
})
export class RateLimitModule {}
