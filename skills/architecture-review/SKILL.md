---
name: architecture-review
description: Review ScaleForge architecture for modular-monolith boundaries, dependency direction, data ownership, consistency, scalability, operability, and failure isolation. Use for design proposals, ADR reviews, new module or integration decisions, queue and cache changes, Kubernetes topology, or requests to compare architectural options.
---

# Architecture Review

1. State the problem, constraints, quality attributes, and evidence that a change is needed.
2. Map affected modules, data owners, synchronous calls, events, workers, and external systems.
3. Consider at least the current design, one simpler option, and one more scalable option.
4. Evaluate consistency, coupling, failure modes, recovery, security, operability, cost, migration, and reversibility.
5. Prefer an in-process module boundary until independent deployment has evidence-backed value.
6. Verify that PostgreSQL remains authoritative, Redis remains disposable, RabbitMQ carries domain events, and BullMQ runs bounded delivery jobs unless an ADR changes those rules.
7. Produce a recommendation with problem, options, chosen solution, trade-offs, consequences, and validation plan.

Reject diagrams that hide ownership or runtime failure paths. Do not call a design scalable without limits, signals, and a scaling mechanism.
