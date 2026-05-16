import { afterEach, describe, expect, it, vi } from 'vitest';
import type { TelemetrySdk } from './telemetry';
import { getTelemetrySdk, setTelemetrySdk } from './telemetry-runtime';

afterEach(() => {
  setTelemetrySdk(undefined);
});

describe('telemetry runtime', () => {
  it('stores the preloaded telemetry SDK handle for application shutdown', () => {
    const telemetry: TelemetrySdk = {
      shutdown: vi.fn(),
    };

    setTelemetrySdk(telemetry);

    expect(getTelemetrySdk()).toBe(telemetry);
  });

  it('returns undefined when instrumentation was not preloaded', () => {
    expect(getTelemetrySdk()).toBeUndefined();
  });
});
