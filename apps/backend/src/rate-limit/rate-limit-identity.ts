import ipaddr from 'ipaddr.js';

const RATE_LIMIT_IPV6_PREFIX_BITS = 64;

export function normaliseRateLimitIp(value: string): string {
  try {
    const parsed = ipaddr.process(value);

    if (parsed.kind() === 'ipv4') {
      return parsed.toString();
    }

    if (parsed instanceof ipaddr.IPv6) {
      const parts = parsed.parts.slice();
      for (let index = RATE_LIMIT_IPV6_PREFIX_BITS / 16; index < parts.length; index++) {
        parts[index] = 0;
      }

      const prefix = ipaddr.IPv6.parse(parts.map((part) => part.toString(16)).join(':'));
      return `${prefix.toString()}/${RATE_LIMIT_IPV6_PREFIX_BITS}`;
    }

    return value;
  } catch {
    return value;
  }
}
