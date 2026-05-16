import { type DynamicModule, Module } from '@nestjs/common';
import type { TelemetrySdk } from './telemetry';
import { TELEMETRY_SDK } from './telemetry.tokens';
import { TelemetryShutdownService } from './telemetry-shutdown.service';

@Module({})
export class TelemetryModule {
  static forRoot(telemetry: TelemetrySdk | undefined): DynamicModule {
    return {
      module: TelemetryModule,
      providers: [{ provide: TELEMETRY_SDK, useValue: telemetry }, TelemetryShutdownService],
    };
  }
}
