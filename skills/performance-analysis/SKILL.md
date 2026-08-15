---
name: performance-analysis
description: Analyze ScaleForge latency, throughput, resource use, database access, caching, queues, and scaling behavior using measurable evidence. Use for slow endpoint investigations, load-test planning, Prisma query reviews, Redis or RabbitMQ tuning, BullMQ concurrency, HPA analysis, and resilience or capacity questions.
---

# Performance Analysis

1. Define the workload: route or worker, payload shape, concurrency, duration, and target SLO.
2. Establish a reproducible baseline. Record request rate, error rate, p50/p95/p99 latency, CPU, memory, event-loop lag, database saturation, and queue depth.
3. Trace the hot path through service, repository, SQL/indexes, cache, and asynchronous work.
4. Verify cache hit and miss paths, TTL, invalidation, stampede risk, and stale-data tolerance.
5. Verify bounded concurrency, prefetch, retry backoff, connection pools, backpressure, and HPA signal quality.
6. Change one bottleneck at a time and repeat the same measurement.
7. Report baseline, hypothesis, evidence, result, regression risk, and the next experiment.

Do not infer production capacity from a local run. Do not optimize without a measured bottleneck. Keep deterministic system metrics separate from estimates.
