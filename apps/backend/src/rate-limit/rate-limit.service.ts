import { Inject, Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { getRateLimitPolicy, type RateLimitPolicyName } from './rate-limit.policies';
import type { RateLimitDecision, RateLimitIdentity, RateLimitStore } from './rate-limit.types';

export const REDIS_RATE_LIMIT_STORE = Symbol('REDIS_RATE_LIMIT_STORE');
export const LOCAL_RATE_LIMIT_STORE = Symbol('LOCAL_RATE_LIMIT_STORE');

type RateLimitLogger = Pick<PinoLogger, 'setContext' | 'warn'>;

export type RateLimitConsumeRequest = {
  policyName: RateLimitPolicyName;
  identity: RateLimitIdentity;
};

@Injectable()
export class RateLimitService {
  constructor(
    @Inject(REDIS_RATE_LIMIT_STORE) private readonly redisStore: RateLimitStore,
    @Inject(LOCAL_RATE_LIMIT_STORE) private readonly localStore: RateLimitStore,
    @Inject(PinoLogger) private readonly logger: RateLimitLogger,
  ) {
    this.logger.setContext(RateLimitService.name);
  }

  async consume(request: RateLimitConsumeRequest): Promise<RateLimitDecision> {
    const policy = getRateLimitPolicy(request.policyName);
    const input = { policyName: request.policyName, policy, identity: request.identity };

    try {
      return await this.redisStore.consume(input);
    } catch (err) {
      this.logger.warn({ err, policy: request.policyName }, 'rate limit Redis store failed');
      return this.localStore.consume(input);
    }
  }
}
