import './config/load-env-files.bootstrap';

import { loadEnv } from './config/env';
import { createTelemetryConfig, startTelemetry } from './telemetry/telemetry';
import { setTelemetrySdk } from './telemetry/telemetry-runtime';

const env = loadEnv();

setTelemetrySdk(
  startTelemetry(
    createTelemetryConfig({
      enabled: env.OTEL_TRACES_ENABLED,
      endpoint: env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT,
      serviceName: env.OTEL_SERVICE_NAME,
    }),
  ),
);
