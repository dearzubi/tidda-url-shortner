import { describe, expect, it } from 'vitest';
import { createTelemetryConfig } from './telemetry';

describe('createTelemetryConfig', () => {
  it('returns disabled config when tracing is turned off', () => {
    expect(
      createTelemetryConfig({
        enabled: false,
        endpoint: 'http://otel-collector:4318/v1/traces',
        serviceName: 'backend',
      }),
    ).toEqual({ enabled: false });
  });

  it('returns exporter config when tracing is enabled', () => {
    expect(
      createTelemetryConfig({
        enabled: true,
        endpoint: 'http://otel-collector:4318/v1/traces',
        serviceName: 'backend',
      }),
    ).toEqual({
      enabled: true,
      endpoint: 'http://otel-collector:4318/v1/traces',
      serviceName: 'backend',
    });
  });
});
