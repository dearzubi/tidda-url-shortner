import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installFatalErrorHandlers, installForcedShutdown } from './process-shutdown';

class FakeProcess extends EventEmitter {
  exitCode: number | undefined;

  exit(code: number): never {
    this.exitCode = code;
    throw new Error('process.exit');
  }
}

function createLogger() {
  return {
    error: vi.fn(),
    fatal: vi.fn(),
  };
}

describe('process shutdown handlers', () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('forces a non-zero exit when graceful shutdown exceeds the timeout', async () => {
    vi.useFakeTimers();
    const processRef = new FakeProcess();
    const logger = createLogger();

    installForcedShutdown(processRef, logger, 1000);

    processRef.emit('SIGTERM');

    await expect(vi.advanceTimersByTimeAsync(1000)).rejects.toThrow('process.exit');
    expect(processRef.exitCode).toBe(1);
    expect(logger.error).toHaveBeenCalledWith(
      { signal: 'SIGTERM', timeoutMs: 1000 },
      'shutdown timed out, forcing exit',
    );
  });

  it('forces a non-zero exit when a second shutdown signal arrives', () => {
    vi.useFakeTimers();
    const processRef = new FakeProcess();
    const logger = createLogger();

    installForcedShutdown(processRef, logger, 1000);

    processRef.emit('SIGTERM');
    expect(() => processRef.emit('SIGINT')).toThrow('process.exit');

    expect(processRef.exitCode).toBe(1);
    expect(logger.error).toHaveBeenCalledWith(
      { signal: 'SIGINT' },
      'received shutdown signal again, forcing exit',
    );
  });

  it('logs uncaught exceptions before exiting non-zero', () => {
    const processRef = new FakeProcess();
    const logger = createLogger();
    const err = new Error('boom');

    installFatalErrorHandlers(processRef, logger);

    expect(() => processRef.emit('uncaughtException', err)).toThrow('process.exit');

    expect(processRef.exitCode).toBe(1);
    expect(logger.fatal).toHaveBeenCalledWith(
      { err, event: 'uncaughtException' },
      'fatal error, exiting',
    );
  });
});
