import { Module } from '@nestjs/common';
import { MetricsModule } from '../metrics/metrics.module';
import { ConnectivityController } from './connectivity.controller';

@Module({
  imports: [MetricsModule],
  controllers: [ConnectivityController],
})
export class ConnectivityModule {}
