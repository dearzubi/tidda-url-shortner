# ADR 0001: NestJS 11 with CommonJS, v12 ESM migration deferred

**Status:** Accepted
**Date:** 2026-05-11
**Decision-makers:** Zubair Khalid

## Context

NestJS is the backend framework (`apps/backend`). The current
stable release is **11.1.19** (published 2026-04-13). NestJS 11 is
CommonJS-first: official docs, CLI templates, schematics, and samples
all assume CJS and use relative imports without `.js` extensions.

A v12 major release is in flight; see [nestjs/nest#16391][pr] (draft).
Highlights from the release tracker:

- All NestJS packages migrate to ESM (`core` and `common` already
  migrated upstream).
- CLI will prompt CJS vs ESM. ESM projects get **Vitest + oxlint** by
  default.
- Webpack becomes Rspack. Jest becomes Vitest. ESLint becomes oxlint.
- Route decorators gain **Standard Schema** support (Zod, Valibot, and
  similar libraries natively) as an alternative to `class-validator`.
- **Approximate release window: early Q3 2026** (around two months
  from today).
- Packages may ship under the `next` tag in Q2 for early testing.

Three of our pre-existing scaffolding choices (Vitest, Zod, no webpack)
already align with what v12 will make default. Biome is our deliberate
divergence from v12's planned oxlint default.

## Decision

For the initial scaffolding milestone:

1. Use **NestJS 11.x** (currently `11.1.19`) for `apps/backend`.
2. Keep the backend on **CommonJS**: no `"type": "module"`, tsconfig
   `module: "CommonJS"`, no `.js` extensions in relative imports.
3. The web app (`apps/web`) stays native ESM as Vite expects. This
   decision is backend-only.
4. Plan a focused v12 and ESM migration after **stable** v12 lands.

## Alternatives considered

### Native ESM on NestJS 11 today

Possible, but hostile to NestJS 11's defaults: fights the CLI,
schematics, and parts of the plugin ecosystem. We would then migrate
twice (community-ESM-on-11 followed by official-ESM-on-12).

### Adopt the `next` tag in Q2 (when it appears)

Pre-release Nest implies pre-release plugins. For a project intended to
be built up over time, pre-release framework risk is not worth a few
weeks of lead time.

## Migration trigger

Re-open this decision when **all** of the following are true:

- NestJS 12 is on the `latest` npm tag, not `next`.
- The core packages we depend on (`@nestjs/common`, `@nestjs/core`,
  `@nestjs/platform-express`, `@nestjs/testing`) are on 12.x stable.
- No active bug discussions on the v12 release thread blocking adoption.

## Migration scope (when triggered)

A separate ADR will record the decision to migrate. Expected work:

1. Add `"type": "module"` to `apps/backend/package.json`.
2. Switch `packages/tsconfig/node.json` `module` from `CommonJS` to
   `NodeNext` (and `moduleResolution: NodeNext`).
3. Add `.js` extensions to all relative imports in `apps/backend`.
4. Replace `__dirname` and `__filename` with `import.meta.url`-derived
   equivalents.
5. Bump `@nestjs/*` deps to `^12` (pinned exact per repo policy).
6. Audit Nest plugins and third-party Nest modules for v12 compatibility.
7. Optionally adopt `@Body({ schema })` and similar to retire any
   hand-rolled zod validation pipes.

Rough estimate: **half a day**, assuming the plugin audit is clean.

## Consequences

- We ship faster on a stable, well-documented framework version.
- We accept a known, scoped migration commitment in Q3 or Q4 2026.
- New backend code should not encode CJS-isms that would block ESM
  migration. In practice this means: confine `__dirname` reads to
  the module's edge (where the swap to `import.meta.url` is one line),
  and do not rely on synchronous `require()` of dynamic paths.

## References

- PR [#16391][pr]: release v12.0.0 major release (approx. Q3 2026)
- Node.js `require(esm)`: https://nodejs.org/api/esm.html#require
- Joyee Cheung, *require(esm) in Node.js*:
  https://joyeecheung.github.io/blog/2024/03/18/require-esm-in-node-js/

[pr]: https://github.com/nestjs/nest/pull/16391
