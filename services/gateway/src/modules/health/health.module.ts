import { Module } from '@nestjs/common';
import { Controller, Get } from '@nestjs/common';
import { Public } from '@nest-gateway/shared';
import { ProxyModule } from '../proxy/proxy.module';
import { ProxyService } from '../proxy/proxy.service';

@Controller('health')
export class HealthController {
  constructor(private readonly proxy: ProxyService) {}

  @Public()
  @Get()
  check() {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      service: 'gateway',
      // Показывает состояние circuit breaker для каждого downstream сервиса
      downstream: this.proxy.getBreakersStatus(),
    };
  }
}

@Module({
  imports: [ProxyModule],
  controllers: [HealthController],
})
export class HealthModule {}
