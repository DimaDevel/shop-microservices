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
    // ConfigModule - uploads .env and makes ConfigService available globally
    ConfigModule.forRoot({ isGlobal: true }),

    ProxyModule,
    AuthModule,
    HealthModule,
  ],
  providers: [
    // -- Global Guards (executed in this order) ----------------------
    //
    // JwtAuthGuard — first: checks the token.
    // If route is marked with @Public() — it allows the request without checking.
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    // RolesGuard — second: checks roles from @Roles() metadata.
    // Runs only if JwtAuthGuard passed the request (i.e. user is authenticated).
    {
      provide: APP_GUARD,
      useClass: RolesGuard,
    },
    // -- Global Interceptors (executed in this order) ----------------------
    //
    // CorralationIdInterceptor — first: generates/reads correlation ID and adds to response.
    {
      provide: APP_INTERCEPTOR,
      useClass: CorrelationIdInterceptor,
    },
    // LoggingInterceptor — second: logs request + response time.
    {
      provide: APP_INTERCEPTOR,
      useClass: LoggingInterceptor,
    },
    // TimeoutInterceptor — third: cancels request if service did not respond within N seconds.
    {
      provide: APP_INTERCEPTOR,
      useClass: TimeoutInterceptor,
    },

    // ── Global Filters ────────────────────────────────────────
    // Intercepts all unhandled exceptions and formats the response in a consistent way.
    {
      provide: APP_FILTER,
      useClass: HttpExceptionFilter,
    },
  ],
})
export class AppModule {}
