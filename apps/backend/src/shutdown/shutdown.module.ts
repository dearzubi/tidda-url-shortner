import { type DynamicModule, Module } from '@nestjs/common';
import { SHUTDOWN_OPTIONS, type ShutdownOptions, ShutdownService } from './shutdown.service';

@Module({})
export class ShutdownModule {
  static forRoot(options: ShutdownOptions): DynamicModule {
    return {
      module: ShutdownModule,
      providers: [{ provide: SHUTDOWN_OPTIONS, useValue: options }, ShutdownService],
      exports: [ShutdownService],
      global: true,
    };
  }
}
