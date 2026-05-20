# ADR 0007: Backend Redis token-bucket rate limiting

**Status:** Accepted
**Date:** 2026-05-20
**Decision-makers:** Zubair Khalid

## Context

Tidda's phase 1 backend now supports anonymous short-link creation and
redirects. Anonymous link creation is a public write endpoint, so the
service needs abuse control before public launch.

Phase 1 has no authentication, accounts, API keys, or MCP surface. The
only practical anonymous request identity is the client IP address. Later
phases will introduce stronger application identities such as user IDs,
API key IDs, and MCP callers.

The current deployment target is a single VPS with Caddy in front of the
NestJS backend. The design should also work if the backend later runs
multiple instances or moves to a cloud deployment.

## Decision

Implement product-aware rate limiting inside the backend.

Add a backend `RateLimitModule` that applies named policies at the HTTP
boundary before product work is performed. Phase 1 will apply the first
policy to anonymous link creation:

```text
policy: links.create.anonymous
identity: ip:{clientIp}
route: POST /links
```

The limiter runs as a Nest guard. Guards run before request body pipes,
so malformed anonymous `POST /links` attempts consume a token before body
validation rejects them. This is intentional for phase 1. The policy
protects public write attempts at the HTTP boundary, not only successful
link creations.

Use Redis as the primary rate-limit store. Implement the Redis limiter as
a token bucket, using one Redis key per policy and identity:

```text
rate-limit:links.create.anonymous:ip:{clientIp}
```

The `{clientIp}` identity is normalised before key construction:

```text
IPv4: canonical IPv4 address
IPv4-mapped IPv6: canonical IPv4 address
IPv6: canonical /64 prefix
```

Examples:

```text
203.0.113.10 becomes 203.0.113.10
::ffff:203.0.113.10 becomes 203.0.113.10
2001:db8:abcd:1234:1111:2222:3333:4444 becomes 2001:db8:abcd:1234::/64
```

The IPv6 `/64` rule is a deliberate phase 1 abuse-control policy.
Anonymous IPv6 clients often have many usable addresses within the same
network prefix. Keying by the full `/128` address would let a client
obtain fresh buckets by rotating the host portion of the address. `/64`
aggregation is not a perfect identity, but it is a better anonymous
default than full-address IPv6 keys. Later authenticated identities can
use user IDs, API key IDs, or plan-specific policies instead of relying
on IP alone.

The Redis value stores the bucket state:

```text
tokens
last_refill_at_ms
```

Each request runs one Lua script that reads the current bucket state,
uses Redis `TIME` as the authoritative clock, refills tokens, consumes
the request cost when possible, writes the updated state, refreshes key
expiry, and returns the decision metadata. Keeping this logic in one Lua
script makes the decision atomic under concurrent requests.

Use this initial policy shape:

```text
capacity: 10
refill: 10 tokens per 60 seconds
cost: 1 per POST /links
```

The exact numbers can be tuned before launch, but the first
implementation should use the same policy model.

If Redis is unavailable, fall back to a conservative in-memory token
bucket per backend process. The fallback is deliberately best effort. It
protects the public write endpoint during Redis incidents, but it is not
globally accurate when multiple backend instances are running.

Caddy remains responsible for generic edge concerns such as TLS,
compression, route proxying, body-size limits, security headers, and
future coarse IP protection. Caddy is not the source of truth for
product-aware limits.

## HTTP response contract

When a request is rejected by the limiter, return `429 Too Many Requests`
with a small machine-readable body and retry headers.

Use these headers for the phase 1 endpoint:

```http
Retry-After: 43
X-RateLimit-Limit: 10
X-RateLimit-Remaining: 0
X-RateLimit-Reset: 1771524477
```

`Retry-After` is the standard retry signal. It is a relative number of
seconds until at least one token should be available.

`X-RateLimit-Limit` is the token-bucket capacity.

`X-RateLimit-Remaining` is the number of whole tokens remaining after the
current decision.

`X-RateLimit-Reset` is a Unix timestamp in seconds for when at least one
token should be available.

Do not emit `RateLimit` or `RateLimit-Policy` headers in phase 1. The
current IETF header draft is not a stable RFC, while the `X-RateLimit-*`
convention is widely deployed and easier for clients and operators to
understand.

## Failure behaviour

Redis is the source of truth in normal operation.

If Redis is unavailable for `POST /links`, use the local fallback limiter
instead of failing open. The fallback should use a stricter policy than
the Redis limiter, and response headers describe the fallback bucket that
handled the request.

Record fallback usage through logs or metrics, but do not expose a public
header that reveals backend degradation.

Redirects are not rate limited in the first implementation. They can be
monitored initially and given a separate, more generous policy later if
real traffic requires it.

## Alternatives considered

### Fixed window in Redis

A fixed window limiter is simpler to implement with Redis `INCR` and key
expiry. It also maps cleanly to limit, remaining, and reset headers.

We rejected it because token bucket gives better burst handling and is a
better long-term primitive for future API-key and MCP policies. The
additional complexity is acceptable because Redis Lua keeps the critical
decision atomic and contained.

### Edge-only rate limiting

Caddy or a future cloud edge could enforce broad IP limits, but edge
rules do not understand Tidda's product identities and policy names.
They also cannot easily evolve into user, API-key, plan, or MCP-aware
limits.

We rejected edge-only limiting because product-aware enforcement belongs
in the backend. Edge controls remain useful as an outer layer.

### Fail open when Redis is unavailable

Failing open preserves availability, but it leaves a public anonymous
write endpoint unprotected during Redis incidents.

We rejected fail open for link creation. A conservative local fallback is
a better phase 1 trade-off because it preserves limited availability
without removing abuse protection entirely.

### Fail closed when Redis is unavailable

Failing closed gives strong protection, but a transient Redis problem
would make anonymous link creation unavailable.

We rejected fail closed for phase 1 because a small local fallback is
simple and gives a more graceful degradation path.

### Use draft `RateLimit` headers

The `RateLimit` and `RateLimit-Policy` headers are useful, but the
current IETF draft is not a stable RFC.

We rejected them for phase 1. `Retry-After` remains the standard retry
signal, and `X-RateLimit-*` headers give practical visibility without
depending on an unstable draft.

## Consequences

- Anonymous link creation has backend-owned abuse protection before
  public launch.
- Rate-limit policy names can evolve later to authenticated users, API
  keys, quotas, and MCP tool calls.
- IPv6 anonymous identities are grouped by `/64`, so clients cannot
  bypass the phase 1 IP policy just by rotating the lower 64 bits of an
  IPv6 address.
- Malformed anonymous `POST /links` attempts consume tokens before body
  validation, because the limiter protects public write attempts at the
  HTTP boundary.
- Redis Lua keeps each token-bucket decision atomic under concurrent
  requests.
- Redis `TIME` avoids clock skew between multiple backend instances for
  primary limiter decisions.
- Local fallback is intentionally not globally accurate, so it must stay
  conservative and observable.
- Redirect traffic remains unaffected until real traffic shows a need for
  a separate policy.
- The backend must include focused unit and HTTP tests for allowed,
  rejected, refill, header, and Redis-failure fallback paths.

## References

- ADR 0002: Fastify as the HTTP platform for `apps/backend`
- ADR 0005: Link data model for phase 1
- ADR 0006: Counter-based slug generation
- ADR 0008: Backend trusted proxy IP handling
- Redis Lua scripting documentation:
  https://redis.io/docs/latest/develop/programmability/eval-intro/
