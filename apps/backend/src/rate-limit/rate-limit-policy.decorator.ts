import { SetMetadata } from '@nestjs/common';
import type { RateLimitPolicyName } from './rate-limit.policies';

export const RATE_LIMIT_POLICY_METADATA = Symbol('RATE_LIMIT_POLICY_METADATA');

export function RateLimitPolicy(name: RateLimitPolicyName): ReturnType<typeof SetMetadata> {
  return SetMetadata(RATE_LIMIT_POLICY_METADATA, name);
}
