# ADR 001: PostgreSQL with Prisma

- Status: Accepted
- Date: 2026-08-16

## Problem

Orders, item-price snapshots, payments, refresh-token revocation, audit records, outbox events, and consumer idempotency require durable relations, uniqueness, and multi-record atomicity. The data layer must also remain approachable in TypeScript and support controlled migrations.

## Options considered

1. PostgreSQL with Prisma.
2. PostgreSQL with handwritten SQL or a query builder.
3. MongoDB with an ODM.
4. Separate databases per module.

## Chosen solution

Use PostgreSQL as the single authoritative database and Prisma 7 with the PostgreSQL driver adapter. Keep database access behind module repositories. Use transactions for aggregate changes plus audit/outbox records, UUID keys, decimal money, database uniqueness for idempotency, and query-shaped indexes.

## Trade-offs

- Prisma improves type safety, schema readability, and migration repeatability, but raw SQL is still needed for efficient outbox leasing.
- A relational schema makes integrity and transactions explicit, but schema changes require disciplined migration ordering.
- One database simplifies consistent transactions and local operation, but modules are not operationally isolated from database saturation.
- Prisma abstraction does not remove the need to inspect generated SQL, query plans, connection limits, or lock behavior.

## Consequences

Do not bypass repositories for ordinary domain access. Parameterize any raw SQL. Deploy migrations as a separate job before schema-dependent application rollout. Review index benefit against write cost with representative data.
