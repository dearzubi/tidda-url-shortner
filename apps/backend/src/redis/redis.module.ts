import { type DynamicModule, Module } from '@nestjs/common';
import { REDIS_OPTIONS, type RedisOptions, RedisService } from './redis.service';

@Module({})
export class RedisModule {
  static forRoot(options: RedisOptions): DynamicModule {
    return {
      module: RedisModule,
      providers: [{ provide: REDIS_OPTIONS, useValue: options }, RedisService],
      exports: [RedisService],
      global: true,
    };
  }
}
