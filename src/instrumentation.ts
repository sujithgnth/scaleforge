import * as Sentry from '@sentry/nestjs';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from '@opentelemetry/semantic-conventions';

const sentryDsn = process.env.SENTRY_DSN;
if (sentryDsn) {
  Sentry.init({
    dsn: sentryDsn,
    environment: process.env.NODE_ENV ?? 'development',
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1,
  });
}

const otlpEndpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
if (otlpEndpoint) {
  const sdk = new NodeSDK({
    resource: resourceFromAttributes({
      [ATTR_SERVICE_NAME]: process.env.OTEL_SERVICE_NAME ?? 'scaleforge-api',
      [ATTR_SERVICE_VERSION]: process.env.npm_package_version ?? '0.1.0',
    }),
    traceExporter: new OTLPTraceExporter({ url: otlpEndpoint }),
    instrumentations: [getNodeAutoInstrumentations()],
  });
  sdk.start();
  process.once('SIGTERM', () => {
    void sdk.shutdown();
  });
}
