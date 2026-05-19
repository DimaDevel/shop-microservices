import { Module } from '@nestjs/common';
import { Controller, Get } from '@nestjs/common';
import { HealthCheck, HealthCheckService, TerminusModule } from '@nestjs/terminus';
import { KafkaHealthIndicator } from '@nest-gateway/kafka';

@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly kafka: KafkaHealthIndicator,
  ) {}

  @Get()
  @HealthCheck()
  check() {
    return this.health.check([
      () => this.kafka.isHealthy('kafka'),
    ]);
  }
}

@Module({
  imports: [TerminusModule],
  controllers: [HealthController],
})
export class HealthModule {}
