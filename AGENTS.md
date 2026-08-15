# ScaleForge agent guide

## Working agreement

- Inspect the existing module, tests, Prisma schema, and relevant ADR before editing.
- Preserve the modular-monolith boundary. Do not introduce a deployable service without a measured scaling or isolation need and a new ADR.
- Keep request code in the direction `Controller -> Service -> Repository -> Prisma`.
- Keep controllers free of business rules. Keep Prisma access in repositories and infrastructure adapters.
- Treat PostgreSQL as authoritative. Redis data must be disposable and rebuildable.
- Use RabbitMQ for cross-domain events and BullMQ for bounded notification-delivery jobs. Do not use both for the same responsibility.
- Put state changes and outbox writes in one database transaction. Make consumers idempotent before acknowledging messages.
- Never accept client-calculated prices, role claims, payment amounts, or resource ownership.
- Never log passwords, bearer tokens, refresh tokens, secret values, or payment data.

## Change workflow

1. State the behavior and failure boundary being changed.
2. Implement the smallest coherent change inside one domain when possible.
3. Add or update tests that prove the behavior, authorization, and important failure path.
4. Update Swagger DTO metadata, migrations, operational config, and ADRs when contracts change.
5. Run `npm run lint`, `npm run build`, `npm test`, and `npm run test:e2e`.
6. Run `npm run test:integration` for persistence, Redis, RabbitMQ, outbox, or worker changes.

## Useful commands

- `npm run verify` — static checks, unit/HTTP tests, and OpenAPI generation.
- `npm run test:integration` — PostgreSQL, Redis, and RabbitMQ Testcontainers flow.
- `docker compose config --quiet` — Compose structure validation.
- `kubectl kustomize k8s` — render raw Kubernetes manifests.
- `helm lint helm/scaleforge` — validate the chart.

Use the project skills under `skills/` for focused backend, security, performance, and architecture reviews.
