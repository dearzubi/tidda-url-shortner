import { Inject, Injectable, type OnApplicationShutdown } from '@nestjs/common';
import type { TelemetrySdk } from './telemetry';
import { TELEMETRY_SDK } from './telemetry.tokens';

@Injectable()
export class TelemetryShutdownService implements OnApplicationShutdown {
  constructor(@Inject(TELEMETRY_SDK) private readonly telemetry: TelemetrySdk | undefined) {}

  async onApplicationShutdown(): Promise<void> {
    await this.telemetry?.shutdown();
  }
}
