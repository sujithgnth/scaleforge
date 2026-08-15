# ADR 002: Redis cache-aside with bounded staleness

- Status: Accepted
- Date: 2026-08-16

## Problem

The restaurant/menu catalog is read frequently and changes less often. Repeating the same joined PostgreSQL read adds avoidable latency and database load, but stale prices must never be used to calculate an order.

## Options considered

1. No cache; read PostgreSQL for every request.
2. In-process cache in each API replica.
3. Redis cache-aside with TTL and explicit invalidation.
4. Redis as the authoritative menu store.

## Chosen solution

Use Redis cache-aside for the active catalog response with a 60-second TTL and versioned key. Invalidate the catalog prefix after a successful restaurant/menu write. Never use the cached catalog to price orders; the order transaction reads current menu rows from PostgreSQL.

## Trade-offs

- Redis reduces repeat-read latency and database load, but introduces another dependency and a possible cache stampede on a cold key.
- TTL bounds stale display data, but does not guarantee immediate consistency if invalidation fails after the database commit.
- Prefix scanning is simple for a small versioned key set, but must be replaced with explicit key tracking or version bumps if cardinality grows.
- Failing when Redis is unavailable exposes dependency health, but a database fallback could offer higher read availability at overload risk.

## Consequences

Treat cached data as disposable. Measure hit ratio, miss latency, and PostgreSQL fallback load before changing TTL. Add request coalescing only if cold-key stampedes are measured. Document any future fallback because it changes failure semantics.
