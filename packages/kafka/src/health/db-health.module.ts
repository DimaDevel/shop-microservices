import { Module } from '@nestjs/common';
import { Controller, Get } from '@nestjs/common';
import { HealthCheck, HealthCheckService, TerminusModule, TypeOrmHealthIndicator } from '@nestjs/terminus';
import { Public } from '@nest-gateway/shared';

@Controller('health')
export class DbHealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly db: TypeOrmHealthIndicator,
  ) {}

  @Public()
  @Get()
  @HealthCheck()
  check() {
    return this.health.check([() => this.db.pingCheck('database')]);
  }
}

@Module({
  imports: [TerminusModule],
  controllers: [DbHealthController],
})
export class DbHealthModule {}
