import { Controller, Get } from '@nestjs/common';
import { MetricsService } from '../metrics/metrics.service';

type ConnectivityResponse = {
  status: 'ok';
  service: 'backend';
};

@Controller('status')
export class ConnectivityController {
  constructor(private readonly metrics: MetricsService) {}

  @Get()
  status(): ConnectivityResponse {
    this.metrics.recordConnectivityCheck();
    return { status: 'ok', service: 'backend' };
  }
}
