import { type DynamicModule, Module } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';
import { getActiveTraceLogFields } from './trace-log-fields';

export type LoggingOptions = {
  level: 'debug' | 'info' | 'warn' | 'error';
  pretty: boolean;
  service: string;
};

const REDACT_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers["set-cookie"]',
  'req.headers["x-api-key"]',
  'res.headers["set-cookie"]',
  '*.password',
  '*.token',
  '*.secret',
  '*.apiKey',
];

const IGNORED_URLS = new Set(['/livez', '/readyz', '/metrics']);

@Module({})
export class LoggingModule {
  static forRoot(options: LoggingOptions): DynamicModule {
    return {
      module: LoggingModule,
      global: true,
      imports: [
        LoggerModule.forRoot({
          pinoHttp: {
            level: options.level,
            base: { service: options.service },
            ...(options.pretty
              ? { transport: { target: 'pino-pretty', options: { singleLine: true } } }
              : {}),
            mixin: getActiveTraceLogFields,
            redact: { paths: REDACT_PATHS, remove: true },
            autoLogging: {
              ignore: (req) => {
                let url: string | undefined = req.url;
                if ('originalUrl' in req && typeof req.originalUrl === 'string') {
                  url = req.originalUrl;
                }
                return url !== undefined && IGNORED_URLS.has(url);
              },
            },
          },
        }),
      ],
    };
  }
}
