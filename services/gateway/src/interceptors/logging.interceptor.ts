import { Injectable, NestInterceptor, ExecutionContext, CallHandler, Logger } from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';

// ─────────────────────────────────────────────────────────────
//  LoggingInterceptor
//
//  Logs every request: method, path, status code, and response time.
//  Correlation ID is already in context (set by the previous interceptor).
//
//  Output: [Gateway] GET /users/123 → 200 (45ms) [corr: abc-123]
// ─────────────────────────────────────────────────────────────
@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('Gateway');

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest();
    const response = context.switchToHttp().getResponse();
    const { method, url } = request;
    const correlationId = request.correlationId ?? '-';
    const start = Date.now();

    this.logger.log(`→ ${method} ${url} [corr: ${correlationId}]`);

    return next.handle().pipe(
      tap(() => {
        const ms = Date.now() - start;
        const status = response.statusCode;
        this.logger.log(`← ${method} ${url} ${status} (${ms}ms) [corr: ${correlationId}]`);
      }),
    );
  }
}
