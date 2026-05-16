import './config/load-env-files.bootstrap';

import { loadEnv } from './config/env';
import { createApp } from './create-app';
import { createBootstrapLogger } from './logging/bootstrap-logger';
import { installFatalErrorHandlers, installForcedShutdown } from './process-shutdown';
import { getTelemetrySdk } from './telemetry/telemetry-runtime';

// This is the one deliberate process.env read outside config parsing: the
// bootstrap logger must exist before loadEnv() can report invalid config.
const bootstrapLogger = createBootstrapLogger();

async function bootstrap(): Promise<void> {
  const env = loadEnv();

  installFatalErrorHandlers(process, bootstrapLogger);
  installForcedShutdown(process, bootstrapLogger, env.SHUTDOWN_TIMEOUT_MS);

  const app = await createApp(env, getTelemetrySdk());
  await app.listen({ port: env.BACKEND_PORT, host: '0.0.0.0' });
}

void bootstrap().catch((err) => {
  bootstrapLogger.fatal({ err }, 'startup failed');
  process.exit(1);
});
