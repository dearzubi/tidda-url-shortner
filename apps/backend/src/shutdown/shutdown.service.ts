import { type BeforeApplicationShutdown, Inject, Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';

export const SHUTDOWN_OPTIONS = Symbol('SHUTDOWN_OPTIONS');

export type ShutdownOptions = {
  drainDelayMs: number;
};

type ShutdownLogger = Pick<PinoLogger, 'info' | 'setContext'>;

const DRAIN_SIGNALS = new Set(['SIGTERM', 'SIGINT']);

@Injectable()
export class ShutdownService implements BeforeApplicationShutdown {
  private draining = false;

  constructor(
    @Inject(SHUTDOWN_OPTIONS) private readonly options: ShutdownOptions,
    @Inject(PinoLogger) private readonly logger: ShutdownLogger,
  ) {
    this.logger.setContext(ShutdownService.name);
  }

  isDraining(): boolean {
    return this.draining;
  }

  async beforeApplicationShutdown(signal?: string): Promise<void> {
    this.draining = true;
    const logRecord = { signal, drainDelayMs: this.options.drainDelayMs };

    this.logger.info(logRecord, 'application shutdown started');

    if (signal === undefined || !DRAIN_SIGNALS.has(signal) || this.options.drainDelayMs === 0) {
      this.logger.info(logRecord, 'application shutdown drain skipped');
      return;
    }

    await new Promise<void>((resolve) => {
      setTimeout(resolve, this.options.drainDelayMs);
    });
    this.logger.info(logRecord, 'application shutdown drain complete');
  }
}
