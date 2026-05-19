import { Module } from '@nestjs/common';
import { Controller, Get } from '@nestjs/common';
import {
  HealthCheck,
  HealthCheckError,
  HealthCheckService,
  HealthIndicatorResult,
  MemoryHealthIndicator,
  TerminusModule,
} from '@nestjs/terminus';
import { Public } from '@nest-gateway/shared';
import { ProxyModule } from '../proxy/proxy.module';
import { ProxyService } from '../proxy/proxy.service';

@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly memory: MemoryHealthIndicator,
    private readonly proxy: ProxyService,
  ) {}

  @Public()
  @Get()
  @HealthCheck()
  check() {
    return this.health.check([
      () => this.memory.checkHeap('memory_heap', 300 * 1024 * 1024),
      () => this.checkCircuitBreakers(),
    ]);
  }

  private checkCircuitBreakers(): HealthIndicatorResult {
    const breakers = this.proxy.getBreakersStatus();
    const anyOpen = Object.values(breakers).some((s: any) => s.state === 'open');
    const result: HealthIndicatorResult = {
      circuit_breakers: { status: anyOpen ? 'down' : 'up', ...breakers },
    };
    if (anyOpen) {
      throw new HealthCheckError('One or more circuit breakers are open', result);
    }
    return result;
  }
}

@Module({
  imports: [TerminusModule, ProxyModule],
  controllers: [HealthController],
})
export class HealthModule {}
