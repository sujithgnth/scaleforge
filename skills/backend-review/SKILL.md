---
name: backend-review
description: Review ScaleForge NestJS and TypeScript backend changes for correctness, domain boundaries, persistence safety, asynchronous failure handling, tests, and maintainability. Use for pull-request reviews, local diffs, controller/service/repository changes, Prisma changes, messaging changes, or requests to assess backend production readiness.
---

# Backend Review

Review evidence before conclusions.

1. Read `AGENTS.md`, the affected module, tests, Prisma schema, and relevant ADRs.
2. Trace each changed request from controller to service to repository to database or queue.
3. Check authorization, validation, state transitions, transaction boundaries, idempotency, concurrency, error mapping, logging, and cleanup.
4. Check public contracts for backward compatibility and Swagger accuracy.
5. Run the narrowest relevant test first, then `npm run lint`, `npm run build`, and broader tests when justified.
6. Report only actionable findings. Include severity, exact file/line evidence, runtime impact, and a concrete fix.

Treat missing tests as a finding only when they leave a meaningful behavior or failure boundary unverified. Distinguish confirmed defects from risks that require runtime evidence. Do not edit code unless the user asks for a fix.
