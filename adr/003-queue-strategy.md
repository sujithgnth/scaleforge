# ADR 003: RabbitMQ for domain events and BullMQ for delivery jobs

- Status: Accepted
- Date: 2026-08-16

## Problem

`OrderCreated` and `PaymentCompleted` must reach multiple consumers without coupling request latency to notifications or audit work. Notification delivery also needs bounded concurrency, job retries, and recovery. Database commits and broker publication cannot be one atomic transaction.

## Options considered

1. Execute every side effect synchronously in the request.
2. Use only BullMQ for events and jobs.
3. Use only RabbitMQ for events and delivery work.
4. Use RabbitMQ for domain-event fan-out, BullMQ for notification-delivery jobs, and a PostgreSQL transactional outbox.

## Chosen solution

Write domain events to an outbox in the business transaction. Lease and publish them to a durable RabbitMQ topic exchange with publisher confirms. Give notification and audit consumers separate queues, retries, DLQs, manual acknowledgement, and database idempotency markers. After persisting a notification delivery, enqueue a BullMQ job with the delivery ID as its deterministic job ID.

## Trade-offs

- The outbox closes the commit/publish loss gap but adds polling latency, table maintenance, and possible duplicate publication.
- RabbitMQ gives explicit routing and consumer isolation, but adds broker topology and operator burden.
- BullMQ provides ergonomic delayed retries and concurrency for Redis-backed jobs, but operating two queue technologies requires a sharp responsibility boundary.
- Idempotency yields effectively-once state changes for local consumers, not globally exactly-once external side effects.

## Consequences

Never publish domain events directly from controllers. Never acknowledge before durable local effects and downstream enqueueing succeed. Monitor outbox age, retry/DLQ depth, and notification status. A real provider adapter must use its own idempotency key and a recoverable processing lease.
