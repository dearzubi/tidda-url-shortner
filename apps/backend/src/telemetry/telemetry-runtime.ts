import type { TelemetrySdk } from './telemetry';

type TelemetryRuntime = typeof globalThis & {
  __backendTelemetrySdk: TelemetrySdk | undefined;
};

const telemetryRuntime = globalThis as TelemetryRuntime;

export function setTelemetrySdk(telemetry: TelemetrySdk | undefined): void {
  telemetryRuntime.__backendTelemetrySdk = telemetry;
}

export function getTelemetrySdk(): TelemetrySdk | undefined {
  return telemetryRuntime.__backendTelemetrySdk;
}
