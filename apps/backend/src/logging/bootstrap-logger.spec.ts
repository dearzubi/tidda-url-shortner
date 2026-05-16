import { describe, expect, it } from 'vitest';
import { getBootstrapLoggerOptions } from './bootstrap-logger';

describe('getBootstrapLoggerOptions', () => {
  it('uses readable pretty logs before config parsing in development', () => {
    expect(getBootstrapLoggerOptions({ nodeEnv: 'development', logLevel: 'debug' })).toEqual({
      level: 'debug',
      base: { service: 'backend' },
      transport: { target: 'pino-pretty', options: { singleLine: false } },
    });
  });

  it('keeps production bootstrap logs as structured JSON', () => {
    expect(getBootstrapLoggerOptions({ nodeEnv: 'production', logLevel: 'debug' })).toEqual({
      level: 'debug',
      base: { service: 'backend' },
    });
  });

  it('defaults an invalid bootstrap log level to info', () => {
    expect(getBootstrapLoggerOptions({ nodeEnv: 'development', logLevel: 'verbose' }).level).toBe(
      'info',
    );
  });
});
