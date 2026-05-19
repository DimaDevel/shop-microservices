import { Injectable, Inject } from '@nestjs/common';
import { HealthCheckError, HealthIndicator, HealthIndicatorResult } from '@nestjs/terminus';
import { Kafka } from 'kafkajs';

@Injectable()
export class KafkaHealthIndicator extends HealthIndicator {
  constructor(@Inject('KAFKA_INSTANCE') private readonly kafka: Kafka) {
    super();
  }

  async isHealthy(key: string): Promise<HealthIndicatorResult> {
    const admin = this.kafka.admin();
    try {
      await admin.connect();
      await admin.describeCluster();
      await admin.disconnect();
      return this.getStatus(key, true);
    } catch (err) {
      await admin.disconnect().catch(() => {});
      throw new HealthCheckError(
        'Kafka health check failed',
        this.getStatus(key, false, { message: (err as Error).message }),
      );
    }
  }
}
