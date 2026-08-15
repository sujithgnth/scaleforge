---
name: security-analysis
description: Analyze ScaleForge backend code and infrastructure for exploitable security weaknesses across authentication, RBAC, validation, data access, secrets, queues, observability, containers, and Kubernetes. Use for threat-focused reviews, OWASP checks, security design questions, dependency-risk triage, or validation of a proposed security change.
---

# Security Analysis

1. Establish assets, trust boundaries, attacker capability, entry points, and deployment assumptions.
2. Trace authentication and authorization on every affected route; verify resource ownership separately from role checks.
3. Inspect validation, injection surfaces, sensitive logging, password/token handling, refresh rotation, rate limits, and error disclosure.
4. Inspect Prisma transactions, raw SQL parameterization, idempotency keys, RabbitMQ redelivery, BullMQ job identity, and replay behavior.
5. Inspect image users, secret delivery, ingress TLS assumptions, service-account tokens, privileges, and writable filesystems.
6. Check dependency advisories with `npm audit --omit=dev`; validate reachability before assigning severity.
7. Report source-to-sink evidence, prerequisites, impact, confidence, and remediation. Mark speculative issues clearly.

Never place credentials or tokens in commands, fixtures, logs, findings, or committed examples. Do not claim exploitability from a package version alone.
