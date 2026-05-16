# Agent Instructions

This file is the canonical source of conventions for any AI coding agent
working in this repo. Read it before touching code.

## Hard rules (must)

- **Package manager:** pnpm only. Never run `npm`, `yarn`, or `bun`.
  Enforced via `preinstall`, `packageManager` field, and `engines`.
- **Exact versions:** No `^` or `~` in `package.json`. `save-exact=true`
  is set in `.npmrc`. When suggesting deps, give exact versions.
- **Node:** v24 LTS, pinned via `.nvmrc` and `engines.node`.
- **Conventional commits:** All commit messages and PR titles.
  Lefthook + commitlint enforce.
- **Conventional branch names:** Use a conventional type prefix followed
  by a slash, such as `ci/`, `fix/`, `feat/`, `chore/`, `docs/`, or
  `refactor/`.
- **Commit subject only.** Never add a commit body unless the user
  explicitly asks for one. The subject line is the whole message by
  default.
- **Lint/format:** Biome only. No ESLint, no Prettier.
- **Tests:** Vitest only. No Jest anywhere, including `apps/backend`.
- **Do not commit** local overrides (`*.env.local`, `*.env.*.local`) or
  the root `/.env`. Per-app `.env` and `.env.[mode]` ARE committed with
  safe defaults. Update them and the zod schema whenever you add a
  variable.
- **Do not create** files outside the directory map below without
  proposing the change first.

## Code style

- **Functions:** Prefer traditional `function foo() {}` declarations
  over `const foo = () => {}`. Arrow functions are reserved for cases
  where they truly shine: event handlers, short inline callbacks,
  places where lexical `this` matters.
- **Types over interfaces:** Default to `type`. Use `interface` only
  where it genuinely shines (declaration merging, `class X implements`
  contracts that read better as an interface).
- **Strict types:** No `any`. No `// @ts-ignore` / `// @ts-expect-error`
  to silence problems. Fix the type.
- **No brittle casts:** Avoid `x as T`. Use narrowing: `typeof`,
  `instanceof`, custom type guards, discriminated unions. Casts are
  acceptable only at trust boundaries (e.g. after zod validation of
  external data) and should be explicit about why.
- **Reuse over duplication:** If logic appears twice with the same
  intent, extract it. Duplication is acceptable only when the two
  sites have genuinely different reasons to change, and that
  judgement must be deliberate.
- **No `process.env` reads** outside the parsed config object
  (`src/config/env.ts`).
- **Zod v4 idioms.** Use top-level format functions (`z.url()`,
  `z.email()`, `z.uuid()`, `z.iso.datetime()`, and so on) over the
  deprecated `z.string().url()` style. Read errors via
  `error.issues[].path` and `.message`; do not use the dropped
  `error.errors` or the deprecated `error.format()` /
  `error.flatten()`. The shared validate-or-throw helper is
  `parseSchema` from `@template/shared`; use it instead of hand-rolling
  `safeParse` plus error formatting per call site.

## Documentation style

- **British English** throughout all prose (docs, ADRs, commit
  messages, comments).
- **No em-dashes.** Reword with commas, colons, parentheses, or
  split sentences.
- **No directional arrow symbols** in prose. Use words: "to",
  "becomes", "produces", and so on.
- **No emojis.** Anywhere in this repo: docs, commits, code, comments.

## Stack

| Layer         | Tech                                            |
| ------------- | ----------------------------------------------- |
| Monorepo      | pnpm workspaces                                 |
| Backend       | NestJS + Fastify + TypeScript                   |
| Frontend      | Vite + React + TypeScript                       |
| Styling       | Tailwind + shadcn/ui (inside `apps/web`)        |
| DB            | PostgreSQL via Kysely (+ kysely-codegen)        |
| Cache         | Redis                                           |
| Lint/format   | Biome                                           |
| Test runner   | Vitest                                          |
| Git hooks     | Lefthook                                        |
| Container     | Docker + docker-compose                         |
| Observability | Prometheus + Grafana                            |
| Env parsing   | Zod, in a typed `env.ts` per app                |

## Directory map

```
apps/
  backend/  NestJS, owns Kysely migrations (src/db/migrations)
  web/      Vite + React, shadcn in src/components/ui
packages/
  shared/         Shared TS types, API contracts, zod schemas
  tsconfig/       Shared tsconfig presets
  biome-config/   Shared Biome config
infra/
  docker/         Dockerfiles per app
  compose/        docker-compose.yml + overrides
  observability/  Prometheus + Grafana configs and dashboards
docs/
  adr/          Architecture Decision Records
  design/       System-design notes (scaling, capacity, etc.)
  runbooks/     Ops runbooks
  superpowers/  AI-agent working docs (plans, designs, scratchpads).
                LOCAL ONLY; excluded via `.git/info/exclude`. Not
                committed and not synced to remotes.
```

### Where AI-generated docs go

If you (a coding agent) generate a plan, design, or any working document
via the superpowers skill set (or any equivalent), place it under
`docs/superpowers/` by default. That directory is locally git-excluded
on the author's machine and is the canonical home for ephemeral agent
working files.

Only commit a plan or design doc if the user **explicitly** asks for it.
In that case place it under `docs/design/` (durable design notes) or
ask the user where it belongs. Never propose committing files from
`docs/superpowers/`.

## Per-workspace conventions

### `apps/backend` (NestJS + Fastify)
- **HTTP platform: Fastify** via `@nestjs/platform-fastify`. See ADR
  0002 for rationale.
- **Module organisation:** see ADR 0004. Each top-level folder under
  `src/` is a NestJS module. Distinguish **feature modules** (own
  HTTP endpoints, imported only by `app.module.ts`) from **domain
  modules** (own a domain concept, no controller, imported by
  features). One concept, one repository: a table is touched by
  exactly one module. Cross-feature imports are a leak; the fix is
  to extract a domain module.
- **Prefer declarative response shaping** (`@Header`, return values)
  over raw `@Res`. When `@Res` is unavoidable, type the reply as
  `FastifyReply` from `fastify`.
- **Schema-first routes.** Drive request validation, response
  serialisation, and (future) OpenAPI from Zod schemas via a
  JSON-Schema bridge. This is the justification of ADR 0002; do not
  drift into imperative validation inside handlers.
- **Tests use `app.inject()`**, not supertest. Fastify's inject is
  faster, lighter, and avoids an extra dependency.
- **Vitest must use `unplugin-swc`**, never esbuild's default
  TypeScript transform. Esbuild does not implement
  `emitDecoratorMetadata` (by design, per esbuild's docs), and
  NestJS DI reads that metadata at runtime to resolve constructor
  parameter types. Removing `unplugin-swc` from
  `apps/backend/vitest.config.ts` will break every test that touches
  a provider. If we later switch the Nest **builder** to SWC
  (`nest start -b swc`), keep `--type-check` enabled so we do not
  lose type checking on dev rebuilds.
- **DI everywhere.** Cross-cutting concerns flow through NestJS DI.
  Inject via constructor; never reach for module-level state or
  `new`-up a service inside another service. No brittle coupling;
  depend on abstractions where it improves testability.
- Kysely is wrapped in a `DatabaseModule` exposing an injectable
  `Database` token. Never import Kysely directly in services.
- Migrations in `src/db/migrations`. Run via `pnpm db:migrate`.
- Regenerate `src/db/types.ts` via `pnpm db:codegen` after migrations.
- Env parsed once in `src/config/env.ts` (zod).

### `apps/web` (Vite + React)
- shadcn components in `src/components/ui` (copy-paste, not packaged).
- Tailwind theme tokens centralised in `src/styles/theme.css`. Reuse.
- Only `VITE_`-prefixed vars are accessible. Treat all as public.
- Env parsed once in `src/config/env.ts` (zod against `import.meta.env`).
- **Tests:** Vitest browser mode (Playwright + headless Chromium) for
  `*.test.tsx` component tests; Node environment for `*.test.ts`
  pure-logic tests. Workspace projects in `vitest.config.ts` route
  them by filename. **No jsdom and no DOM shims** in this repo; that
  is "prefer real implementations over mocks" applied to the frontend.
- **Component tests use `vitest-browser-react`'s `render`** and
  `expect.element(...)` matchers, not `@testing-library/react` plus
  `@testing-library/jest-dom`. The browser-mode locators are
  retry-able by default; reach for `waitFor` only when you genuinely
  need to drive the event loop manually.

### `packages/shared`
- **Code organisation:** see ADR 0003. Group by concern, not by file
  or technical type. Generic utilities live under `src/<concern>/`
  (today: `src/validation/`). Domain entities, when added, get their
  own vertical-slice folder (e.g. `src/link/`). Top-level
  `src/index.ts` is the public API; consumers import only from
  `@template/shared`, never from sub-paths.
- Types-first where possible; runtime code is fine when shared
  across apps (e.g. zod schemas, `parseSchema`).
- No app-specific imports.
- **Throw `SchemaValidationError`** (from `@template/shared`) at every
  validation boundary, not generic `Error`. Callers can introspect
  `error.issues` to map failures to HTTP responses or log entries.

## Testing

- **Both unit and integration tests are required.** Not one or the other.
- **Tests describe behaviour, not implementation.** A test must still
  pass after a non-functional refactor of the code under test.
  Asserting on internal call counts, private helpers, or mock
  invocation sequences is a smell; verify through the public surface.
- **If you find yourself mocking the thing you're testing,** the
  test boundary is wrong. Redraw it outward.
- **Idiomatic Vitest only:** `describe` / `it` / `expect`, `vi.fn()`,
  `vi.mock()`, `beforeEach`. No Jest-isms or patterns imported from
  other runners. No convoluted setup.
- **Prefer real implementations / fakes over mocks** when feasible.
  Integration tests for `apps/backend` run against real Postgres + Redis
  (Testcontainers or docker-compose test profile).
- **NestJS testing uses `Test.createTestingModule`** with real
  providers wherever possible; override only the bits that need it.

## Env files

Four-file pattern in both `apps/web` and `apps/backend`:

| File                  | Committed | Purpose                          |
| --------------------- | --------- | -------------------------------- |
| `.env`                | yes       | safe defaults shared across modes|
| `.env.local`          | no        | personal overrides               |
| `.env.[mode]`         | yes       | mode-specific safe defaults      |
| `.env.[mode].local`   | no        | personal overrides for that mode |

- Committed `.env*` files contain **no secrets**; treat as public.
- `apps/backend/.env.production` does **not** exist in the repo. Prod
  values come from the container runtime.
- Root `/.env` is for docker-compose only. Gitignored.
  `/.env.example` is committed as its template.
- New env var (per-app): add to the committed `.env.[mode]` (e.g.
  `.env.development`) AND extend the zod schema in `src/config/env.ts`.
- New env var (docker-compose): add to `/.env.example` so the next
  fresh checkout knows the variable exists.

## Commands

```bash
pnpm install                  # install all workspaces
pnpm dev                      # backend + web in parallel
pnpm --filter @template/backend dev
pnpm --filter @template/web dev
pnpm lint                     # biome check
pnpm format                   # biome format --write
pnpm typecheck                # tsc --noEmit, all workspaces
pnpm test                     # vitest
pnpm build                    # build all workspaces
pnpm db:migrate               # kysely migrations
pnpm db:codegen               # regenerate Kysely types
docker compose -f infra/compose/docker-compose.yml up
```

## Do NOT

- Add ESLint, Prettier, Jest, or any tool we've replaced.
- Use `any` or `as T` to dodge a type problem; fix it.
- Add features, abstractions, or files outside the current task's scope.
- Bump dep versions opportunistically. Bumps get their own PR.
- Read `process.env` directly. Go through the parsed config object.
- Skip Lefthook hooks (`--no-verify`) without explicit user instruction.

## When unsure

- Check `docs/adr/` for prior decisions before proposing changes.
- Consequential new decisions get a new ADR.
- Ask before introducing a new dependency, top-level directory, or
  pattern not described here.
