import { Controller, Get, HttpCode, HttpException, HttpStatus } from '@nestjs/common';
import { DatabaseService } from '../db/database.service';
import { RedisService } from '../redis/redis.service';
import { ShutdownService } from '../shutdown/shutdown.service';

type HealthResponse = { status: 'ok' };
type ReadinessFailure = 'not_ready' | 'shutting_down';
const READINESS_CHECK_TIMEOUT_MS = 500;

@Controller()
export class HealthController {
  constructor(
    private readonly shutdown: ShutdownService,
    private readonly database: DatabaseService,
    private readonly redis: RedisService,
  ) {}

  @Get('livez')
  @HttpCode(HttpStatus.OK)
  live(): HealthResponse {
    return { status: 'ok' };
  }

  @Get('readyz')
  @HttpCode(HttpStatus.OK)
  async ready(): Promise<HealthResponse> {
    if (this.shutdown.isDraining()) {
      throwReadinessFailure('shutting_down');
    }

    await this.checkDependency(this.database.checkConnection());
    await this.checkDependency(this.redis.checkConnection());

    return { status: 'ok' };
  }

  private async checkDependency(check: Promise<void>): Promise<void> {
    try {
      await withTimeout(check, READINESS_CHECK_TIMEOUT_MS);
    } catch {
      throwReadinessFailure('not_ready');
    }
  }
}

function throwReadinessFailure(status: ReadinessFailure): never {
  throw new HttpException({ status }, HttpStatus.SERVICE_UNAVAILABLE);
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timeout: NodeJS.Timeout | undefined;

  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => {
          reject(new Error('readiness check timed out'));
        }, timeoutMs);
        timeout.unref();
      }),
    ]);
  } finally {
    if (timeout !== undefined) {
      clearTimeout(timeout);
    }
  }
}
