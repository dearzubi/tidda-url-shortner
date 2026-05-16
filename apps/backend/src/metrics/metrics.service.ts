import { Injectable } from '@nestjs/common';
import { Counter, collectDefaultMetrics, Registry } from 'prom-client';

@Injectable()
export class MetricsService {
  readonly registry: Registry;
  private readonly connectivityChecks: Counter;

  constructor() {
    this.registry = new Registry();
    this.connectivityChecks = new Counter({
      name: 'app_connectivity_checks_total',
      help: 'Total number of successful application connectivity checks.',
      registers: [this.registry],
    });
    collectDefaultMetrics({ register: this.registry });
  }

  recordConnectivityCheck(): void {
    this.connectivityChecks.inc();
  }

  scrape(): Promise<string> {
    return this.registry.metrics();
  }
}
