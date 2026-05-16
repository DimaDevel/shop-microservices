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
//  Читает x-correlation-id из входящего запроса или генерирует новый.
//  Добавляет его в заголовок ответа — клиент может трейсить свой запрос.
//
//  Correlation ID затем прокидывается в сервисы через ProxyService,
//  поэтому один ID виден во всех логах всей системы.
// ─────────────────────────────────────────────────────────────
@Injectable()
export class CorrelationIdInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest();
    const response = context.switchToHttp().getResponse();

    // Берём из входящего запроса или генерируем
    const correlationId =
      request.headers[HEADERS.CORRELATION_ID] ?? crypto.randomUUID();

    // Кладём на request — доступно во всех handler-ах
    request.correlationId = correlationId;

    return next.handle().pipe(
      tap(() => {
        // Добавляем в ответ — клиент видит ID своего запроса
        response.header(HEADERS.CORRELATION_ID, correlationId);
      }),
    );
  }
}
