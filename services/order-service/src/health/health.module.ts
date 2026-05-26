import { Module } from '@nestjs/common';
import { Controller, Get } from '@nestjs/common';
import { HealthCheck, HealthCheckService, TerminusModule, TypeOrmHealthIndicator } from '@nestjs/terminus';
import { Public } from '@nest-gateway/shared';
import { KafkaHealthIndicator } from '@nest-gateway/kafka';

@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly db: TypeOrmHealthIndicator,
    private readonly kafka: KafkaHealthIndicator,
  ) {}

  @Public()
  @Get()
  @HealthCheck()
  check() {
    return this.health.check([() => this.db.pingCheck('database'), () => this.kafka.isHealthy('kafka')]);
  }
}

@Module({
  imports: [TerminusModule],
  controllers: [HealthController],
})
export class HealthModule {}
