import { randomUUID } from 'node:crypto';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Logger, LoggerErrorInterceptor } from 'nestjs-pino';
import { AppModule } from './app.module';
import type { Env } from './config/env';
import type { TelemetrySdk } from './telemetry/telemetry';

export function createFastifyAdapter(): FastifyAdapter {
  return new FastifyAdapter({
    logger: false,
    requestIdHeader: 'x-request-id',
    genReqId: () => randomUUID(),
  });
}

export function configureApp(app: NestFastifyApplication): void {
  const logger = app.get(Logger);
  app.useLogger(logger);
  app.useGlobalInterceptors(new LoggerErrorInterceptor());
  app.enableShutdownHooks(['SIGTERM', 'SIGINT'], { useProcessExit: true });

  app
    .getHttpAdapter()
    .getInstance()
    .addHook('onRequest', (request, reply, done) => {
      reply.header('x-request-id', request.id);
      done();
    });
}

export async function createApp(
  env: Env,
  telemetry?: TelemetrySdk,
): Promise<NestFastifyApplication> {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule.forRoot(env, telemetry),
    createFastifyAdapter(),
    { bufferLogs: true },
  );

  configureApp(app);
  return app;
}
