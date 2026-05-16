import { type DynamicModule, Module } from '@nestjs/common';
import type { Env } from './config/env';
import { ConnectivityModule } from './connectivity/connectivity.module';
import { DatabaseModule } from './db/database.module';
import { HealthModule } from './health/health.module';
import { LoggingModule } from './logging/logging.module';
import { MetricsModule } from './metrics/metrics.module';
import { RedisModule } from './redis/redis.module';
import { ShutdownModule } from './shutdown/shutdown.module';
import type { TelemetrySdk } from './telemetry/telemetry';
import { TelemetryModule } from './telemetry/telemetry.module';

@Module({})
export class AppModule {
  static forRoot(env: Env, telemetry?: TelemetrySdk): DynamicModule {
    const isProduction = env.NODE_ENV === 'production';

    return {
      module: AppModule,
      imports: [
        LoggingModule.forRoot({
          level: env.LOG_LEVEL ?? (isProduction ? 'info' : 'debug'),
          pretty: !isProduction,
          service: 'backend',
        }),
        DatabaseModule.forRoot({
          databaseUrl: env.DATABASE_URL,
          maxConnections: env.DB_POOL_MAX,
          connectionTimeoutMs: env.DB_POOL_CONNECTION_TIMEOUT_MS,
          idleTimeoutMs: env.DB_POOL_IDLE_TIMEOUT_MS,
        }),
        RedisModule.forRoot({
          redisUrl: env.REDIS_URL,
          connectionTimeoutMs: env.DB_POOL_CONNECTION_TIMEOUT_MS,
        }),
        TelemetryModule.forRoot(telemetry),
        ShutdownModule.forRoot({ drainDelayMs: env.SHUTDOWN_DRAIN_DELAY_MS }),
        ConnectivityModule,
        HealthModule,
        MetricsModule,
      ],
    };
  }
}
