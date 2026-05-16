type LogRecord = Record<string, unknown>;

type FatalLogger = {
  error(record: LogRecord, message: string): void;
  fatal(record: LogRecord, message: string): void;
};

type ProcessLifecycle = {
  exit(code: number): never;
  on(event: string, listener: (...args: unknown[]) => void): unknown;
};

type ShutdownSignal = 'SIGINT' | 'SIGTERM';

export function installFatalErrorHandlers(processRef: ProcessLifecycle, logger: FatalLogger): void {
  processRef.on('uncaughtException', (err) => {
    logger.fatal({ err, event: 'uncaughtException' }, 'fatal error, exiting');
    processRef.exit(1);
  });

  processRef.on('unhandledRejection', (reason) => {
    const err = reason instanceof Error ? reason : new Error(String(reason));
    logger.fatal({ err, event: 'unhandledRejection' }, 'fatal error, exiting');
    processRef.exit(1);
  });
}

export function installForcedShutdown(
  processRef: ProcessLifecycle,
  logger: FatalLogger,
  timeoutMs: number,
): void {
  let timeout: NodeJS.Timeout | undefined;

  function handleSignal(signal: ShutdownSignal): void {
    if (timeout !== undefined) {
      logger.error({ signal }, 'received shutdown signal again, forcing exit');
      processRef.exit(1);
      return;
    }

    timeout = setTimeout(() => {
      logger.error({ signal, timeoutMs }, 'shutdown timed out, forcing exit');
      processRef.exit(1);
    }, timeoutMs);
    timeout.unref();
  }

  processRef.on('SIGTERM', () => handleSignal('SIGTERM'));
  processRef.on('SIGINT', () => handleSignal('SIGINT'));
}
