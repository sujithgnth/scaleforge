# ScaleForge scaling lab

This lab turns [System Design Crash Course: Scaling 100 to 100M Users](https://www.youtube.com/watch?v=fwVGulYwlak) into a hands-on path through ScaleForge. The user counts are stages in a reasoning model, not capacity claims. A laptop result says nothing reliable about production capacity.

The central rule is simple: **measure one bottleneck, change one thing, and repeat the same workload**. Do not add infrastructure because a diagram at a higher scale contains more boxes.

## The model

Every experiment starts by classifying the pressure:

| Axis    | ScaleForge example                                      | First signals to inspect                                        |
| ------- | ------------------------------------------------------- | --------------------------------------------------------------- |
| Compute | JWT/Argon2 work, serialization, Node event loop         | CPU, memory, event-loop lag, request latency                    |
| Reads   | Restaurant catalog and order history                    | Cache hit rate, query plan, DB pool use, p95/p99                |
| Writes  | Order/payment transactions and outbox inserts           | Lock time, transaction latency, pool saturation, WAL/storage    |
| Async   | Outbox publication, Rabbit consumers, notification jobs | Queue depth, oldest-message age, retry/DLQ rate, worker latency |

Latency, throughput, and capacity are different:

- **Latency** is how long one operation takes.
- **Throughput** is how many operations complete per unit of time.
- **Capacity** is the highest sustainable workload that still meets the chosen latency and error targets.

The scaling probe uses an open-loop offered request rate and a bounded in-flight concurrency. This avoids the common mistake of calling “more simultaneous promises” a workload definition.

## 1. Establish the observable baseline

Start the complete local environment:

```bash
docker compose up --build -d
docker compose ps
curl http://localhost:3000/v1/health/ready
```

Run a low-rate public baseline:

```bash
npm run lab:scale -- \
  --url http://localhost:3000/v1/health/live \
  --rate 5 \
  --duration 10 \
  --warmup 2 \
  --concurrency 10
```

The probe reports offered rate, achieved throughput, status/error counts, client-side backpressure drops, and successful-request p50/p95/p99. It consumes response bodies so the result includes the full HTTP response path. Warm-up samples are discarded.

For an authenticated read path, export a short-lived access token obtained from `/v1/auth/login`; the probe reads it without printing it:

```bash
export SCALEFORGE_LAB_TOKEN='<local access token>'
npm run lab:scale -- \
  --url http://localhost:3000/v1/restaurants \
  --rate 5 \
  --duration 10
unset SCALEFORGE_LAB_TOKEN
```

Optional thresholds make the probe suitable for a repeatable experiment. Choose them before the run; do not move the goalposts after seeing the result:

```bash
npm run lab:scale -- \
  --slo-p99 250 \
  --max-error-rate 0.01 \
  --json
```

Those numbers are an example learning target, not a ScaleForge production SLO. The command exits with code `2` if a supplied threshold fails or the client concurrency cap drops scheduled work.

In Grafana, correlate the client result with the server-side RED signals. Useful PromQL queries are:

```promql
sum(rate(scaleforge_http_requests_total[1m])) by (route, status)
```

```promql
histogram_quantile(
  0.99,
  sum(rate(scaleforge_http_request_duration_seconds_bucket[5m])) by (le, route)
)
```

Open one slow request in Tempo by correlation/trace context before changing code. An average alone can hide the requests users actually feel.

## 2. Climb the scaling ladder

Record every run with the same columns:

| Field               | What to record                                      |
| ------------------- | --------------------------------------------------- |
| Workload            | URL, payload, rate, concurrency, duration, warm-up  |
| Target              | p99 and maximum error rate chosen before the run    |
| Client result       | achieved rate, p50/p95/p99, errors, dropped work    |
| Server result       | CPU, memory, request metrics, trace, dependency use |
| Hypothesis          | one suspected bottleneck                            |
| Change              | exactly one controlled change                       |
| Result and rollback | evidence, regression risk, how to reverse it        |

### Stage A: one modular monolith

Current ScaleForge evidence:

- One NestJS modular monolith with separate API and worker entry points.
- `Controller -> Service -> Repository -> Prisma` dependency direction.
- PostgreSQL owns business truth; Redis is disposable operational state.

Exercise:

1. Run the baseline above.
2. Increase offered rate in small steps while holding duration and concurrency constant.
3. Find the first failed target. Decide whether the pressure is compute, reads, writes, or async.
4. Inspect a trace and server metrics before proposing a fix.

Do not call the highest completed local request rate “system capacity.” The load generator, loopback network, rate limiter, database data size, and laptop all constrain the result.

### Stage B: vertical improvement before horizontal scale

ScaleForge already documents indexes that match implemented query shapes. Select one repository query and verify it with representative data:

```sql
EXPLAIN (ANALYZE, BUFFERS)
SELECT ...;
```

Learning questions:

- Is the time CPU, I/O, lock wait, or connection wait?
- Does the index remove more read cost than the write amplification it adds?
- Does a faster query solve the measured bottleneck more cheaply than another API replica?
- Which serial or contended part will eventually limit the gain?

Never add an index from the column list alone. Preserve the query, dataset shape, plan, and before/after measurement.

### Stage C: stateless horizontal API

ScaleForge access-token authentication and request handling do not require in-process session state. API replicas can therefore share PostgreSQL, Redis, and RabbitMQ. Outbox leasing uses `FOR UPDATE SKIP LOCKED`, so multiple pollers can compete without deliberately owning the same row.

Inspect:

- [`src/app.module.ts`](../src/app.module.ts) for global policy and module composition.
- [`k8s/deployment.yaml`](../k8s/deployment.yaml) and [`helm/scaleforge/templates/hpa.yaml`](../helm/scaleforge/templates/hpa.yaml) for replica/HPA mechanics.
- [`src/health/health.controller.ts`](../src/health/health.controller.ts) for liveness versus readiness.

Failure exercise: stop one dependency, compare `/health/live` with `/health/ready`, then restore it. Liveness should describe the process; readiness should stop routing dependency-bound work. A shallow health check can keep a broken replica in rotation, while an over-eager liveness check can restart an entire fleet during a dependency outage.

The current HPA uses CPU as a portable starting signal. That is not evidence that CPU is the saturated resource. API latency/concurrency and worker queue age/depth are the intended next signals after measurement.

### Stage D: the read wall

Implemented now:

- Restaurant catalog cache-aside in Redis with a 60-second TTL.
- Explicit prefix invalidation after a committed restaurant write.
- PostgreSQL fallback is intentionally **not** used when Redis fails; the failure stays visible.
- Order history uses offset pagination and query-specific indexes.

Cache experiment:

```bash
docker compose exec redis redis-cli DEL restaurants:active:v1
npm run lab:scale -- \
  --url http://localhost:3000/v1/restaurants \
  --rate 5 \
  --duration 10
```

Use the access-token environment variable from the baseline section. Compare the cold miss with warm hits in traces and server metrics. Then ask:

- What hit rate is required for Redis to materially reduce database load?
- Can concurrent cold requests stampede PostgreSQL?
- Is stale catalog data acceptable, and for how long?
- Is fail-open to PostgreSQL safer for users, or can it turn a Redis incident into a database incident?

Not implemented by design: request coalescing for cache misses, read replicas, cursor pagination, materialized views, CDN behavior, and hot-key replication. Add one only after its failure mode is the experiment being studied.

### Stage E: the write wall

Implemented now:

- Short PostgreSQL transactions for server-priced orders and payments.
- Optimistic locking for order transitions.
- Database-enforced idempotency keys for payment retries.
- An outbox row in the same transaction as the business state change.

Inspect the configured PostgreSQL connection budget before adding API replicas. A deployment can increase HTTP capacity while exhausting the shared database pool and making total throughput worse.

Not implemented by design: sharding, consistent hashing, CQRS read models, and polyglot persistence. Treat each as a written design exercise:

1. Name the measured write/query limit.
2. Choose the partition key and identify hot-partition risk.
3. Explain cross-partition transactions and resharding.
4. Define migration, rollback, and observability.
5. Compare the proposal with batching, indexing, pooling, or functional partitioning.

Functional module boundaries come before deployable services or database shards.

### Stage F: asynchronous work

Implemented now:

- PostgreSQL transactional outbox for durable publication intent.
- RabbitMQ topic exchange for cross-domain facts.
- Publisher confirms, manual acknowledgements, bounded prefetch, retry queues, and DLQs.
- `(consumer, eventId)` uniqueness for idempotent redelivery.
- BullMQ only for bounded notification-delivery jobs with deterministic job IDs.

Trace the real flow in [`docs/architecture.md`](architecture.md): business transaction → outbox poller → RabbitMQ → idempotent consumer → BullMQ delivery job.

Failure exercise:

1. Stop RabbitMQ.
2. Create an order through the authenticated API.
3. Verify that the database transaction and outbox intent commit even though publication cannot complete.
4. Restart RabbitMQ and observe publication recovery, queue depth, retries, and consumer processing.
5. Inspect the DLQ. A DLQ without an alert and replay runbook is delayed data loss.

At-least-once delivery is the contract. “Exactly once” is not claimed: a crash can occur after an external side effect and before the local result/ack. Any real provider adapter must receive a stable idempotency key.

### Stage G: resilience under overload

Implemented now:

- Global rate limiting, with tighter authentication limits.
- Bounded RabbitMQ prefetch and BullMQ concurrency.
- Capped messaging retries and explicit dead-lettering.
- Readiness, structured logs, metrics, and traces.

Raise the probe rate until `429` responses appear. That is the limiter protecting capacity, not proof that the server cannot process more requests. Keep authentication endpoints out of capacity benchmarks; their intentionally tighter limits protect Argon2 and account workflows.

Missing experiments worth adding later: deadline propagation, circuit breakers, load shedding by request priority, retry jitter for HTTP dependencies, and graceful feature degradation. Each needs a real slow/failing dependency seam; a decorative circuit-breaker library around no external call teaches very little.

### Stage H: regions, cells, and cost

ScaleForge does not claim multi-region operation. Before proposing it, answer:

- Which recovery-time and recovery-point objectives require another region?
- Is the topology active-passive or active-active?
- Who resolves concurrent writes, and what consistency can the product relax?
- How are tenants/users assigned to cells so one failure has a bounded blast radius?
- Are DNS TTL, data replication, backups, restore drills, egress, and idle capacity included in the cost?

For this repository, a tested backup/restore and single-region multi-zone design is the simpler next step. Multi-region writes would require a new ADR and evidence that the extra consistency and operational cost solves a real requirement.

## 3. Concept coverage map

| Concept family               | ScaleForge status | Best place to learn it                                   |
| ---------------------------- | ----------------- | -------------------------------------------------------- |
| RED metrics, p99, traces     | Implemented       | Probe + Prometheus/Grafana/Tempo                         |
| Stateless API, health checks | Implemented       | API/auth code + Kubernetes probes                        |
| Cache-aside and invalidation | Implemented       | Restaurant service + Redis experiment                    |
| Query indexes, pagination    | Partial           | Prisma schema/repositories; cursor pagination is a gap   |
| Connection/pool saturation   | Documented gap    | Measure before changing replica counts                   |
| Outbox and idempotent events | Implemented       | Order/payment transaction and queue modules              |
| Queues, topics, retry, DLQ   | Implemented       | RabbitMQ + BullMQ failure exercise                       |
| Backpressure                 | Partial           | Probe concurrency cap, Rabbit prefetch, Bull concurrency |
| Rate limiting                | Implemented       | Increase offered rate and inspect `429`                  |
| Read replicas/sharding/CQRS  | Design exercise   | Add only for a measured read/write limit                 |
| Circuit breakers/deadlines   | Design exercise   | Add with a real slow dependency and failure injection    |
| Multi-region/cells/CAP       | Design exercise   | Architecture proposal plus new ADR, not a local claim    |

## 4. The four-question decision loop

When a run fails, write down:

1. **Which resource is saturated?** Compute, reads, writes, or async work—supported by a metric or trace.
2. **Can the demand be reduced?** Cache, batch, paginate, reject, defer, or remove unnecessary work.
3. **Can the bottleneck scale safely?** Scale up or out without exhausting a shared dependency or widening the failure domain.
4. **What new failure did the change create?** Staleness, duplicates, reordering, hot partitions, retry storms, higher cost, or harder recovery.

That loop is the transferable skill. The target architecture is not the diagram with the most boxes; it is the smallest design that meets a measured reliability and performance requirement.
