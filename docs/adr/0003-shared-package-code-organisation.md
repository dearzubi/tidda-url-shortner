# ADR 0003: Code organisation in `packages/shared`

**Status:** Accepted
**Date:** 2026-05-11
**Decision-makers:** Zubair Khalid

## Context

`packages/shared` is the workspace-internal package consumed by both
`apps/backend` and `apps/web`. It will hold:

- Generic validation utilities (today: `parseSchema`,
  `SchemaValidationError`).
- Cross-app domain types and zod schemas when project-specific domain
  concepts are added.
- Other shared utilities that are not framework-specific.

Unlike the apps, `packages/shared` has no framework conventions to
defer to. NestJS dictates the module structure of `apps/backend`. Vite
and shadcn shape `apps/web/src/`. `packages/shared` is greenfield, so
the convention must be set explicitly or the first few additions will
drift into incompatible patterns.

## Decision

Organise `packages/shared/src/` **by concern, not by file and not by
technical type**. A directory exists only when it has at least two
closely related files, or when it is the established home for content
arriving soon. Two patterns coexist as the package grows.

### Pattern A: group by concern (now)

Each directory represents a single concern that grows together as a
unit. Generic utilities live in their own directory.

```
packages/shared/src/
├── validation/
│   ├── parse-schema.ts
│   ├── parse-schema.spec.ts
│   ├── schema-validation-error.ts
│   ├── schema-validation-error.spec.ts
│   └── index.ts
└── index.ts
```

The top-level `index.ts` is the public API of `@template/shared` and
re-exports each subdirectory's barrel. Consumers import only from
`@template/shared`, never from sub-paths.

### Pattern B: vertical slices per domain entity (when domain entities appear)

When we add the first domain object, that entity gets its own folder
containing its type, its zod schema, related helpers, and tests. The
example below uses a deliberately generic `Item` domain object.

```
packages/shared/src/
├── validation/        # generic utilities, stays as Pattern A
├── item/
│   ├── item.ts            # Item type
│   ├── item.schema.ts     # zod schema
│   ├── item.spec.ts
│   └── index.ts
└── index.ts
```

Pattern A and Pattern B coexist. Generic utilities remain grouped by
concern. Domain entities get their own slice. The boundary is clear:
if something is specific to a domain entity, it lives in that entity's
folder.

## What we deliberately do not do

- **Per-file folders.** A folder containing one file is navigation
  noise. Filenames already namespace files within a folder.
- **Folders by technical type** (`classes/`, `functions/`, `errors/`,
  `utils/`). These split related code across folders for no benefit
  and group unrelated code by accident.
- **Pre-creating empty folders** for content we expect to add later.
  Empty placeholders rot; create a folder only when it has content.
- **Sub-path imports from consumers.** `apps/backend` and `apps/web`
  import only from `@template/shared`. The top-level barrel is the
  contract; the internal layout is free to evolve without breaking
  apps.

## Naming

- **Filenames**: kebab-case (`parse-schema.ts`,
  `schema-validation-error.ts`). Matches Biome defaults and is easy
  to scan in directory listings.
- **Exports**: PascalCase for classes and types
  (`SchemaValidationError`, `SchemaIssue`), camelCase for functions
  (`parseSchema`).
- **One main export per file** where reasonable, with the filename
  matching the kebab-case form of the main export.

## Migration trigger

Re-open this decision when adding the first domain entity to
`packages/shared`. At that point, decide whether the entity warrants
its own Pattern B folder (default expectation: yes) or whether it fits
inside an existing concern folder. The decision is recorded as a short
addendum to this ADR, or as a new ADR if the broader pattern changes.

## Trigger to revisit the overall scheme

If we accumulate three or more sibling directories at `src/` root,
reconsider whether the current boundaries still make sense. At that
scale a different organisation (e.g. by bounded context, by module
hierarchy) may serve better than concern-grouping at one level.

## Consequences

- Lean structure now, clear growth path.
- New contributors have an explicit rule for where to add
  things.
- Imports stay stable across internal reorganisations because the
  public surface is the top-level barrel.
- The price is one extra level of nesting compared to flat files at
  `src/` root. For a package this small that is a real cost. We
  accept it because we expect the package to grow and want the
  pattern set from the start.

## References

- AGENTS.md: code style and per-workspace rules (binding)
- ADR 0001: NestJS 11 with CommonJS, v12 ESM migration deferred
- ADR 0002: Fastify as the HTTP platform for `apps/backend`
