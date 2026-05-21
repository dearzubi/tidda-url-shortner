import { describe, expect, it } from 'vitest';
import { normaliseRateLimitIp } from './rate-limit-identity';

describe('normaliseRateLimitIp', () => {
  it('keeps canonical IPv4 addresses unchanged', () => {
    expect(normaliseRateLimitIp('203.0.113.10')).toBe('203.0.113.10');
  });

  it('converts IPv4-mapped IPv6 addresses to IPv4', () => {
    expect(normaliseRateLimitIp('::ffff:203.0.113.10')).toBe('203.0.113.10');
  });

  it('converts expanded IPv4-mapped IPv6 addresses to IPv4', () => {
    expect(normaliseRateLimitIp('0000:0000:0000:0000:0000:ffff:cb00:710a')).toBe('203.0.113.10');
  });

  it('normalises IPv6 addresses to a canonical /64 prefix', () => {
    expect(normaliseRateLimitIp('2001:db8:abcd:1234:1111:2222:3333:4444')).toBe(
      '2001:db8:abcd:1234::/64',
    );
  });

  it('maps different addresses in the same IPv6 /64 to the same identity', () => {
    expect(normaliseRateLimitIp('2001:db8:abcd:1234::1')).toBe(
      normaliseRateLimitIp('2001:db8:abcd:1234:ffff:ffff:ffff:ffff'),
    );
  });

  it('keeps different IPv6 /64 prefixes separate', () => {
    expect(normaliseRateLimitIp('2001:db8:abcd:1234::1')).not.toBe(
      normaliseRateLimitIp('2001:db8:abcd:1235::1'),
    );
  });

  it('falls back to the raw value when the input is not parseable as an IP address', () => {
    expect(normaliseRateLimitIp('not-an-ip')).toBe('not-an-ip');
  });
});
