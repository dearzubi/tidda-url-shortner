# ADR 0002: Fastify as the HTTP platform for `apps/backend`

**Status:** Accepted
**Date:** 2026-05-11
**Decision-makers:** Zubair Khalid

## Context

NestJS supports two HTTP platforms: `@nestjs/platform-express` (the
default, on Express 5 since late 2024) and `@nestjs/platform-fastify`
(on Fastify 5 in 2026). Both are first-class and equally well
maintained by the Nest team. We must pick one before scaffolding
`apps/backend`.

Adjacent decisions already made for this repo:

- ADR 0001 commits the backend to NestJS 11 with CommonJS, migrating
  to v12 ESM after stable lands.
- Zod is the chosen validator for env config and shared schemas, and
  is the intended source of truth for request and response shapes when
  we add real routes.
- Vitest is the test runner.

This ADR is being decided early, when the cost of changing platforms
is small (one bootstrap file, one or two test setup helpers). Delaying
the decision compounds with every route added.

## Decision

Use **Fastify** via `@nestjs/platform-fastify` for `apps/backend`.

Tests use Fastify's native `app.inject()` rather than supertest.
Controllers should prefer NestJS's declarative decorators (`@Header`,
return values) over raw `@Res` access. Where `@Res` is unavoidable,
type the reply as `FastifyReply`.

## Why Fastify, in good faith

Performance is not the headline. Express 5 is fast enough for most
application workloads this template is likely to start with, and many
hot paths will be bound by database, cache, or external service latency
rather than framework overhead. The honest case for Fastify rests on a
different argument.

### 1. Schema-first lifecycle aligns with the rest of the repo

Every other validation decision in this codebase defers to Zod: the
env loader parses `process.env` through a Zod schema, and
`packages/shared` is being built around Zod schemas as the cross-app
contract.

Fastify's request lifecycle is built around schemas: validation,
response serialisation, OpenAPI generation, and error formatting all
derive from a single declarative shape. With a Zod-to-JSON-Schema
bridge (we will reach for `zod-to-json-schema` or `nestjs-zod` when
needed), one Zod definition drives:

- Fastify request validation (parameters, body, query).
- Fastify response serialisation (compiled once at boot via
  `fast-json-stringify`).
- OpenAPI generation, when we add it.
- Generated client types, when we add them.

Express has no equivalent lifecycle. Under Express we would
re-implement validation imperatively in every controller, maintain
parallel DTO classes and decorators for OpenAPI, and write
serialisation logic per response shape. The cost of adding a route
under Fastify scales with one schema; under Express it scales with
four artefacts that drift.

This is the primary justification and it compounds across every route
we add. If we plan to write more than a handful of routes, Fastify's
ergonomic alignment pays back the cost of the framework choice.

### 2. Pre-compiled response serialisation

`fast-json-stringify` compiles a JSON serialiser from each response
schema once at startup. Serialisation becomes O(known shape) rather
than O(reflection over an arbitrary object). For JSON-heavy application
APIs such as listing records, returning dashboards, or querying reports,
this is real work the framework does for us, paid for only by writing
the schemas we were going to write anyway.

### 3. Encapsulated plugin scoping

Fastify hooks scope cleanly to a route or subtree. Express middleware
is a global pipeline by convention; ordering and scope live in the
developer's head. As `apps/backend` grows to include rate limiting,
auth, request logging, and tracing, encapsulated hooks make it easier
to reason about which middleware applies where, and easier to test in
isolation.

### 4. Tighter tail latency under burst load

Many application workloads have burst characteristics: a product
launch, a scheduled import, a marketing campaign, or a spike from an
integration partner. Fastify's lower per-request CPU translates to
tighter p99 and p99.9 latencies under sustained concurrency. The order
of magnitude is single-digit-percent at p50 and low-double-digit at
p99, which is real but not transformative. This is a secondary
justification; if we never reach the load that exposes it, the benefit
is theoretical.

We deliberately do **not** justify this decision on hello-world
benchmark numbers, which compare frameworks with no I/O, no real
serialisation surface, and no representative payloads. Those numbers
overstate the realised gain by a factor of five or more.

## Alternatives considered

### Express 5 (`@nestjs/platform-express`)

The default. Express 5 closed real gaps from v4: native async error
handling, ReDoS-hardened path-to-regexp, bundled body parser. It
remains the path of least resistance, with the broader community
footprint and the largest body of off-the-shelf middleware. We
rejected it because the schema-first argument above gives Fastify a
structural advantage that compounds with each route, and because we
made the choice at low cost (before any routes exist).

If we had only health and metrics endpoints to ship, Express 5 would
be fine. The decision tilts the moment we expect real CRUD surfaces.

### Some other framework outside NestJS

Out of scope. NestJS itself is locked in by the project's broader
architecture choices.

## Costs and acknowledged risks

- **Plugin compatibility audit.** Some Nest plugins quietly assume
  `express.Request` or `express.Response`. The popular ones
  (`@nestjs/swagger`, `@nestjs/throttler`, `@nestjs/serve-static`)
  work with Fastify, but we check at adoption time. If a plugin we
  need is Express-only, we wrap or fork before switching frameworks.
- **Smaller community footprint.** Fewer community blog posts,
  tutorials, and cached answers to obscure problems compared with
  Express. The Fastify docs and Nest's Fastify recipe page are good,
  so we expect to lean on those plus reading source when needed.
- **Commitment.** This decision is most defensible if we actually
  write Zod schemas for all real routes. If we drift toward
  imperative validation inside handlers, we pay the cost of Fastify
  without collecting its main payoff.

## Trigger to revisit

Re-open this decision if:

- A critical Nest plugin we need is Express-only and the wrap or fork
  cost exceeds the framework switch cost.
- A Fastify or `@nestjs/platform-fastify` bug blocks our roadmap and
  is not being addressed upstream.
- We deliberately move away from schema-first validation (which would
  invalidate the primary justification of this ADR).

## References

- `@nestjs/platform-fastify`:
  https://docs.nestjs.com/techniques/performance
- Fastify v5 docs: https://fastify.dev/docs/latest/
- `fast-json-stringify`:
  https://github.com/fastify/fast-json-stringify
- ADR 0001: NestJS 11 with CommonJS, v12 ESM migration deferred
