# ADR 0004: Feature modules vs domain modules in `apps/backend`

**Status:** Accepted
**Date:** 2026-05-12
**Decision-makers:** Zubair Khalid

## Context

`apps/backend` follows the NestJS feature-module pattern: each
top-level folder under `src/` is a self-contained `@Module()` owning
its controllers, services, and tests. The scaffolding milestone has
two feature modules (`health/`, `metrics/`) plus one infrastructure
module (`db/`) and one configuration helper (`config/`).

The first real product feature may introduce domain concepts that more
than one feature needs to operate on. A common example is **Customer**:
a customer is created by an account-management feature, read by billing,
and summarised by reporting. If each feature implements its own
customer lookup, validation, and persistence, the domain concept has no
owner. After three or four features, refactoring breaks unrelated tests
and "who owns Customer?" has no answer.

This ADR establishes the rule before the leak happens.

## Decision

Distinguish two kinds of NestJS modules under `apps/backend/src/`:

### Feature module

- Owns one or more HTTP endpoints.
- Has a controller (or several).
- May have an orchestrator service that composes multiple domain
  modules.
- Imported only by `app.module.ts`.
- Examples (current): `health/`, `metrics/`. Examples (future):
  `accounts/`, `billing/`, `reports/`.

### Domain module

- Owns a single domain concept (entity or value object).
- Has **no controller** and exposes no HTTP surface.
- Owns the canonical service for the concept (validation, business
  rules) and the only repository that touches the concept's table(s).
- Exported and imported by other modules. Features and other domain
  modules consume it.
- Examples (future): `customer/`, `invoice/`.

## Rules

1. **Domain modules have no controllers.** Their public API is the
   service they export. If a domain module needs an HTTP surface, a
   feature module imports it and exposes the surface.
2. **One concept, one repository.** If two features both need to
   write to the `customers` table, they both call
   `CustomerService.create()`. The repository lives inside `customer/`
   and is private to that module.
3. **Features depend on domain, never the reverse.** A domain module
   importing a feature module is a strong code smell: the domain
   concept should not know about its HTTP wrappers.
4. **Domain modules can compose other domain modules** (e.g. a
   billing-focused domain module may compose `CustomerModule` and
   `InvoiceModule`). Circular imports between domain modules mean the
   conceptual boundaries are wrong or there is a missing third concept.
5. **No cross-feature imports.** A feature reaching into another
   feature's folder is a leak. The fix is to extract the shared logic
   into a domain module.

## The trigger to extract a domain module

Apply the test: **"Would more than one feature module want this if it
existed?"** If yes, the concept is a domain module from day one. Do
not wait for the second feature to arrive before carving it out. A
Customer concept usually clears this test early in a business
application.

## Alternatives considered

### Layered folders (`controllers/`, `services/`, `repositories/`)

Splits features across three folders, fragmenting changes. Rejected
for the same reasons we rejected technical-type folders in
`packages/shared` (see ADR 0003).

### Full Domain-Driven Design

Aggregates, value objects, bounded contexts, anti-corruption layers,
event sourcing. Real tools for real problems; not yet earned at our
scale. We adopt only "entity + domain service + repository", which is
the smallest viable slice of DDD. Re-evaluate when we have multiple
bounded contexts with genuinely divergent language and rules.

### Let features import each other freely

Easiest to start with, hardest to refactor later. After three features
that quietly cross-import, untangling them is a multi-PR refactor.
Cheaper to draw the line before the leak.

## Costs and acknowledged risks

- **Judgement call required.** "Feature or domain module?" is not
  always obvious. Default to feature module; promote to domain module
  the moment a second consumer appears or the trigger test above
  passes.
- **Domain modules can become god-modules** if everything lands in
  them. Limit each domain module to one concept. If a service inside
  `customer/` is doing billing aggregation, that work belongs in
  `invoice/` or `billing/`'s orchestrator, not in `CustomerService`.
- **Risk of overdesign.** Extracting a domain module for one feature
  is premature. The rule is "more than one consumer", not "anything
  that could ever be reused".

## Trigger to revisit

Re-open this decision when:

- We have more than five domain modules at the same level. At that
  point, a grouping layer (e.g. by bounded context) may be needed.
- A domain module reaches more than around ten source files.
  Sub-modules within the domain folder become appropriate.
- We hit a real DDD problem (multiple bounded contexts with divergent
  ubiquitous language, complex transactional boundaries). At that
  point, this ADR is replaced or extended.

## References

- AGENTS.md: per-workspace conventions for `apps/backend`
- ADR 0001: NestJS 11 with CommonJS, v12 ESM migration deferred
- ADR 0002: Fastify as the HTTP platform for `apps/backend`
- ADR 0003: Code organisation in `packages/shared`
