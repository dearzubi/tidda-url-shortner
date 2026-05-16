import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ShutdownService } from './shutdown.service';

function createLogger() {
  return {
    info: vi.fn(),
    setContext: vi.fn(),
  };
}

describe('ShutdownService', () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('reports ready before shutdown begins', () => {
    const service = new ShutdownService({ drainDelayMs: 1000 }, createLogger());

    expect(service.isDraining()).toBe(false);
  });

  it('marks the app as draining immediately and waits for the configured drain window on SIGTERM', async () => {
    vi.useFakeTimers();
    const logger = createLogger();
    const service = new ShutdownService({ drainDelayMs: 3000 }, logger);

    const shutdown = service.beforeApplicationShutdown('SIGTERM');

    expect(service.isDraining()).toBe(true);
    expect(logger.info).toHaveBeenCalledWith(
      { signal: 'SIGTERM', drainDelayMs: 3000 },
      'application shutdown started',
    );

    let resolved = false;
    shutdown.then(() => {
      resolved = true;
    });

    await vi.advanceTimersByTimeAsync(2999);
    expect(resolved).toBe(false);

    await vi.advanceTimersByTimeAsync(1);
    await expect(shutdown).resolves.toBeUndefined();
    expect(resolved).toBe(true);
    expect(logger.info).toHaveBeenCalledWith(
      { signal: 'SIGTERM', drainDelayMs: 3000 },
      'application shutdown drain complete',
    );
  });

  it('does not wait when app.close triggers shutdown without an operating-system signal', async () => {
    vi.useFakeTimers();
    const logger = createLogger();
    const service = new ShutdownService({ drainDelayMs: 3000 }, logger);

    await expect(service.beforeApplicationShutdown()).resolves.toBeUndefined();

    expect(service.isDraining()).toBe(true);
    expect(logger.info).toHaveBeenCalledWith(
      { signal: undefined, drainDelayMs: 3000 },
      'application shutdown started',
    );
    expect(logger.info).toHaveBeenCalledWith(
      { signal: undefined, drainDelayMs: 3000 },
      'application shutdown drain skipped',
    );
  });
});
