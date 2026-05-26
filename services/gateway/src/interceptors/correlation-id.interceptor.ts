import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { HEADERS } from '@nest-gateway/shared';

// ─────────────────────────────────────────────────────────────
//  CorrelationIdInterceptor
//
//  Reads x-correlation-id from the incoming request or generates a new one.
//  Attaches it to the response header so clients can trace their request.
//
//  The correlation ID is forwarded to downstream services via ProxyService,
//  so a single ID is visible across all logs in the system.
// ─────────────────────────────────────────────────────────────
@Injectable()
export class CorrelationIdInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest();
    const response = context.switchToHttp().getResponse();

    // Use value from incoming request or generate a new one
    const correlationId =
      request.headers[HEADERS.CORRELATION_ID] ?? crypto.randomUUID();

    // Attach to request — available in all handlers
    request.correlationId = correlationId;

    return next.handle().pipe(
      tap(() => {
        // Attach to response — client can trace their own request
        response.header(HEADERS.CORRELATION_ID, correlationId);
      }),
    );
  }
}
