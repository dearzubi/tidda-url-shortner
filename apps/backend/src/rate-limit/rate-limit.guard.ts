import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { RateLimitPolicyName } from './rate-limit.policies';
import { RateLimitService } from './rate-limit.service';
import type { RateLimitDecision } from './rate-limit.types';
import { normaliseRateLimitIp } from './rate-limit-identity';
import { RATE_LIMIT_POLICY_METADATA } from './rate-limit-policy.decorator';

@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly rateLimits: RateLimitService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const policyName = this.reflector.get<RateLimitPolicyName>(
      RATE_LIMIT_POLICY_METADATA,
      context.getHandler(),
    );

    if (!policyName) {
      return true;
    }

    const http = context.switchToHttp();
    const request = http.getRequest<FastifyRequest>();
    const reply = http.getResponse<FastifyReply>();
    const decision = await this.rateLimits.consume({
      policyName,
      identity: { kind: 'ip', value: normaliseRateLimitIp(request.ip) },
    });

    setRateLimitHeaders(reply, decision);

    if (!decision.allowed) {
      reply.header('Retry-After', decision.retryAfterSeconds.toString());
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          error: 'Too Many Requests',
          message: 'Rate limit exceeded',
          policy: policyName,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    return true;
  }
}

function setRateLimitHeaders(reply: FastifyReply, decision: RateLimitDecision): void {
  reply.header('X-RateLimit-Limit', decision.limit.toString());
  reply.header('X-RateLimit-Remaining', decision.remaining.toString());
  reply.header('X-RateLimit-Reset', decision.resetAtEpochSeconds.toString());
}
