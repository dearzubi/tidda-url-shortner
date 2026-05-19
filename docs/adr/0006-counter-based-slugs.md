# ADR 0006: Counter-based slug generation

**Status:** Accepted
**Date:** 2026-05-19
**Decision-makers:** Zubair Khalid

## Context

Tidda needs generated short-link slugs for phase 1. Custom slugs are
out of scope. Anonymous links are ownerless records, and slug
generation must be reliable under concurrent requests.

The main options are random strings, truncated hashes, and counters.
Random strings and truncated hashes both require accepting
probabilistic collisions, then handling database unique-constraint
failures and retries. Hashing also raises product questions around URL
canonicalisation and deduplication that phase 1 does not need to
answer.

## Decision

Use a counter-based slug generator.

Phase 1 will allocate a monotonically increasing integer from
PostgreSQL, encode it as Base62, and store the encoded value in
`links.slug`.

Use a PostgreSQL sequence as the durable counter in phase 1. The
sequence is part of the database schema and benefits from PostgreSQL's
atomic sequence allocation. Redis counter batches may be introduced
later if the database sequence becomes a bottleneck, but that
complexity is not needed for the first deployment.

Keep the unique constraint on `links.slug` as a final guardrail. The
counter should prevent normal collisions, but the database remains the
source of truth if operational mistakes occur.

## Slug Shape

Encode counters with the Base62 alphabet:

```text
0-9A-Z-a-z
```

Start the sequence at `62^5`, which produces six-character slugs from
the first generated link. This avoids very short slugs and keeps the
public shape stable without padding.

Generated slugs should match:

```text
^[0-9A-Za-z]{6,12}$
```

The upper bound is a validation guard, not a capacity limit we expect
to approach in phase 1.

## Reserved Paths

Root-level redirects create route-name conflicts with application
paths. The generator must skip reserved slugs such as:

```text
links
livez
readyz
status
metrics
```

Skipping a reserved slug burns that counter value. This is acceptable.
Counters already trade compactness for deterministic uniqueness and
simple operations.

## Alternatives considered

### Random slugs

Random slugs are easy to generate and hard to enumerate, but
uniqueness is probabilistic. The system must insert, catch collisions,
and retry. That is reasonable at small scale, but the failure mode is
less direct than a counter.

### Truncated hash slugs

Truncated hashes are deterministic and can help deduplicate identical
destination URLs, but deduplication is not a phase 1 requirement. They
also force URL canonicalisation decisions earlier than needed and
still require collision handling when hashes are truncated.

### Redis counter from day one

Redis supports atomic `INCR` and `INCRBY`, and can support future batch
allocation across multiple backend instances. We rejected it for phase
1 because PostgreSQL is already required for link creation, provides
durable sequence allocation, and keeps the first implementation
simpler.

## Consequences

- Slug uniqueness is deterministic in normal operation.
- Link creation does not need a database lookup to check whether a
  generated slug already exists.
- Slugs are predictable and enumerable, so rate limiting and abuse
  controls remain important before public launch.
- The sequence is a central allocator. If high write volume or
  multi-region deployment arrives later, revisit batch allocation or
  sharded counter strategies.
- The database unique constraint remains necessary as a final
  correctness guardrail.

## References

- ADR 0005: Link data model for phase 1
- `docs/superpowers/specs/2026-05-16-rate-limits-phased-design.md`
- Zubair Khalid, "Short URLs, Long List of Trade-offs":
  https://dearzubair.dev/blog/ensuring-uniqueness-for-a-url-shortener/
