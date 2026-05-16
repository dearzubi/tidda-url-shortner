import { type DynamicModule, Module } from '@nestjs/common';
import { DATABASE_OPTIONS, type DatabaseOptions, DatabaseService } from './database.service';

@Module({})
export class DatabaseModule {
  static forRoot(options: DatabaseOptions): DynamicModule {
    return {
      module: DatabaseModule,
      providers: [{ provide: DATABASE_OPTIONS, useValue: options }, DatabaseService],
      exports: [DatabaseService],
      global: true,
    };
  }
}
