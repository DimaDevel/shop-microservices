import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD, APP_INTERCEPTOR, APP_FILTER } from '@nestjs/core';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';
import { CorrelationIdInterceptor } from './interceptors/correlation-id.interceptor';
import { TimeoutInterceptor } from './interceptors/timeout.interceptor';
import { LoggingInterceptor } from './interceptors/logging.interceptor';
import { HttpExceptionFilter } from './filters/http-exception.filter';
import { ProxyModule } from './modules/proxy/proxy.module';
import { AuthModule } from './modules/auth/auth.module';
import { HealthModule } from './modules/health/health.module';

@Module({
  imports: [
    // ConfigModule — загружает .env и делает ConfigService доступным везде
    ConfigModule.forRoot({ isGlobal: true }),

    ProxyModule,
    AuthModule,
    HealthModule,
  ],
  providers: [
    // ── Global Guards (выполняются в этом порядке) ───────────
    //
    // JwtAuthGuard — первый: проверяет токен.
    // Если роут помечен @Public() — пропускает без проверки.
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    // RolesGuard — второй: проверяет роли из @Roles() метаданных.
    // Запускается только если JwtAuthGuard пропустил запрос.
    {
      provide: APP_GUARD,
      useClass: RolesGuard,
    },

    // ── Global Interceptors (выполняются в этом порядке) ─────
    //
    // CorrelationIdInterceptor — первый: генерирует/читает ID и добавляет в ответ.
    {
      provide: APP_INTERCEPTOR,
      useClass: CorrelationIdInterceptor,
    },
    // LoggingInterceptor — логирует запрос + время ответа.
    {
      provide: APP_INTERCEPTOR,
      useClass: LoggingInterceptor,
    },
    // TimeoutInterceptor — отменяет запрос если сервис не ответил за N секунд.
    {
      provide: APP_INTERCEPTOR,
      useClass: TimeoutInterceptor,
    },

    // ── Global Filters ────────────────────────────────────────
    // Перехватывает все HTTP исключения и форматирует ответ единообразно.
    {
      provide: APP_FILTER,
      useClass: HttpExceptionFilter,
    },
  ],
})
export class AppModule {}
