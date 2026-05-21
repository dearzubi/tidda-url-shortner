# ADR 0008: Backend trusted proxy IP handling

**Status:** Accepted
**Date:** 2026-05-20
**Decision-makers:** Zubair Khalid

## Context

Tidda runs the backend behind Caddy in production. Caddy is the public
entry point and the backend is private. Public API requests reach the
backend through Caddy, not directly from browsers.

The backend still needs the real client IP address for anonymous abuse
controls, including the phase 1 `POST /links` rate limiter from ADR 0007.
When a reverse proxy forwards a request, the direct TCP peer seen
by the backend is the proxy container, not the end user. The real client
IP is carried in forwarded headers such as `X-Forwarded-For`.

Those headers are only trustworthy when they come from infrastructure we
control. If the backend trusted forwarded headers from every source, an
attacker could spoof `X-Forwarded-For` if the backend were ever exposed
directly through a port mapping, cloud networking change, or sidecar
bypass.

## Decision

Do not use Fastify `trustProxy: true` in production. The backend must
trust only explicit reverse proxy sources.

Configure the backend with a CIDR or comma-separated list of trusted
proxy addresses:

```dotenv
BACKEND_TRUSTED_PROXIES=172.30.10.0/29
```

Parse this value once in backend env configuration and pass it to
Fastify's `trustProxy` option. An empty value means `false`.
The value `true` is accepted only as an explicit development escape
hatch for unusual local topologies. Production must use an explicit IP
or CIDR list, not `true`.

Production compose should use a dedicated Docker network for public
request forwarding:

```yaml
networks:
  proxy_to_backend:
    internal: true
    ipam:
      config:
        - subnet: 172.30.10.0/28
          ip_range: 172.30.10.8/29
```

Only reverse proxies get static addresses in the trusted range:

```yaml
services:
  web:
    networks:
      public:
      proxy_to_backend:
        ipv4_address: 172.30.10.2
```

Backend replicas join `proxy_to_backend` but keep dynamic addresses from
the `ip_range`. They also join separate internal networks for data and
observability dependencies as needed.

The initial trusted range is deliberately small:

```text
172.30.10.0/29
```

It reserves enough room for Caddy and a small number of future reverse
proxy instances, while keeping backend replicas outside the trusted
proxy range. The first Caddy instance uses `172.30.10.2`; low addresses
are kept for infrastructure, and `.1` is left for the Docker bridge
gateway.

Caddy remains responsible for setting or augmenting `X-Forwarded-*`
headers when reverse proxying to the backend. With Caddy as the first
public hop, Caddy ignores spoofed incoming `X-Forwarded-*` values by
default for the headers it manages. If a CDN or cloud load balancer is
later placed in front of Caddy, configure Caddy to trust only that
upstream proxy's published ranges. The backend should still trust only
the immediate Caddy or proxy network that can connect to it.

## Alternatives considered

### Trust every proxy

Fastify supports `trustProxy: true`, which trusts forwarded headers from
all sources.

We rejected this because rate limiting uses client IP as an identity.
Trusting every source turns forwarded headers into attacker-controlled
identity if the backend is ever reachable directly.

### Trust one proxy hop

Fastify can also trust by hop count, for example one proxy hop.

We rejected this as the phase 1 default because it is less explicit than
trusting a concrete Docker proxy range. It can be reconsidered for
platforms where the immediate proxy address is not stable but the
network path is tightly controlled.

### Trust the whole internal Docker network

The backend could trust the broad internal Docker network used by Caddy,
Postgres, Redis, and observability services.

We rejected this because a compromised non-proxy container on that
network could spoof forwarded headers. A dedicated proxy-to-backend
network keeps the trust boundary narrow.

## Consequences

- `request.ip` in backend handlers and guards can be used as the
  anonymous client IP only after Fastify has verified the direct peer is
  a trusted proxy.
- Accidental direct backend exposure does not automatically let clients
  spoof `X-Forwarded-For`.
- Proxy scaling is supported by assigning additional proxy instances IPs
  inside the reserved trusted proxy range.
- Backend scaling is supported because backend replicas use dynamic
  addresses outside the trusted proxy range.
- The trusted proxy value must be reviewed whenever the production
  ingress topology changes.
- Docker static IPs are used only for reverse proxies, not backend
  replicas.

## References

- ADR 0007: Backend Redis token-bucket rate limiting
- Docker Compose network IPAM documentation:
  https://docs.docker.com/reference/compose-file/networks/
- Docker Compose static service IP documentation:
  https://docs.docker.com/reference/compose-file/services/#ipv4_address-ipv6_address
- Caddy reverse proxy documentation:
  https://caddyserver.com/docs/caddyfile/directives/reverse_proxy
- Fastify server `trustProxy` documentation:
  https://fastify.dev/docs/latest/Reference/Server/
