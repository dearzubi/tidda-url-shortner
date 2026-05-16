import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { ATTR_SERVICE_NAME } from '@opentelemetry/semantic-conventions';

export type TelemetryOptions = {
  enabled: boolean;
  endpoint: string;
  serviceName: string;
};

export type TelemetryConfig =
  | { enabled: false }
  | {
      enabled: true;
      endpoint: string;
      serviceName: string;
    };

export type TelemetrySdk = Pick<NodeSDK, 'shutdown'>;

const IGNORED_TRACE_URLS = new Set(['/livez', '/readyz', '/metrics']);

export function createTelemetryConfig(options: TelemetryOptions): TelemetryConfig {
  if (!options.enabled) {
    return { enabled: false };
  }

  return {
    enabled: true,
    endpoint: options.endpoint,
    serviceName: options.serviceName,
  };
}

export function startTelemetry(config: TelemetryConfig): TelemetrySdk | undefined {
  if (!config.enabled) {
    return undefined;
  }

  const sdk = new NodeSDK({
    resource: resourceFromAttributes({
      [ATTR_SERVICE_NAME]: config.serviceName,
    }),
    traceExporter: new OTLPTraceExporter({
      url: config.endpoint,
    }),
    instrumentations: [
      getNodeAutoInstrumentations({
        '@opentelemetry/instrumentation-fs': { enabled: false },
        '@opentelemetry/instrumentation-pino': { enabled: false },
        '@opentelemetry/instrumentation-http': {
          ignoreIncomingRequestHook: (request) => {
            return request.url !== undefined && IGNORED_TRACE_URLS.has(request.url);
          },
        },
      }),
    ],
  });

  sdk.start();

  return sdk;
}
