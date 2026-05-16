import pino from 'pino';

type BootstrapLogLevel = 'debug' | 'info' | 'warn' | 'error';

type BootstrapLoggerOptionsInput = {
  nodeEnv: string | undefined;
  logLevel: string | undefined;
};

function isBootstrapLogLevel(value: string | undefined): value is BootstrapLogLevel {
  return value === 'debug' || value === 'info' || value === 'warn' || value === 'error';
}

export function getBootstrapLoggerOptions(input: BootstrapLoggerOptionsInput): pino.LoggerOptions {
  const options: pino.LoggerOptions = {
    level: isBootstrapLogLevel(input.logLevel) ? input.logLevel : 'info',
    base: { service: 'backend' },
  };

  if (input.nodeEnv !== 'production') {
    options.transport = { target: 'pino-pretty', options: { singleLine: false } };
  }

  return options;
}

export function createBootstrapLogger(env: NodeJS.ProcessEnv = process.env): pino.Logger {
  return pino(getBootstrapLoggerOptions({ nodeEnv: env.NODE_ENV, logLevel: env.LOG_LEVEL }));
}
