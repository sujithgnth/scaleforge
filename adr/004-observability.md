# ADR 004: Layered, vendor-neutral observability

- Status: Accepted
- Date: 2026-08-16

## Problem

The later visualizer needs request, resource, event, and failure evidence. Operators need local tooling without locking application code to one hosted vendor, while serious unhandled errors should still support optional external alerting.

## Options considered

1. Plain console logging only.
2. A single proprietary monitoring SDK.
3. OpenTelemetry plus Prometheus and structured logs, with optional Sentry.
4. Custom in-application performance storage.

## Chosen solution

Use Pino JSON logs with redaction and correlation IDs, Prometheus for bounded-cardinality operational metrics, OpenTelemetry auto-instrumentation with OTLP export for traces, Loki for local log aggregation, Tempo for local trace storage, Grafana for exploration, and optional Sentry for unhandled exception reporting.

## Trade-offs

- Open standards preserve backend choice, but multiple pipelines require coherent labels, retention, and deployment configuration.
- Auto-instrumentation gives broad coverage quickly, but domain spans and carefully chosen business metrics still need manual additions.
- Sentry improves exception workflow, but requires data-scrubbing review and introduces a vendor dependency when enabled.
- Local Docker observability is useful for experiments, but its single-node retention and Docker-socket log discovery are not production topology.

## Consequences

Keep IDs out of metric labels. Use correlation IDs in logs and trace context for request linkage. Protect metrics and dashboards in shared environments. Define SLOs and alert thresholds from measured workloads rather than copying generic values.
