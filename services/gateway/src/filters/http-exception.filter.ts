import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { FastifyReply, FastifyRequest } from 'fastify';

// ─────────────────────────────────────────────────────────────
//  HttpExceptionFilter
//
//  Перехватывает ВСЕ HTTP исключения (и обычные Error тоже)
//  и форматирует их в единый формат ответа.
//
//  Без фильтра NestJS возвращает разные форматы для разных ошибок.
//  С фильтром — всегда один формат:
//  {
//    statusCode: 401,
//    code: "UNAUTHORIZED",
//    message: "...",
//    correlationId: "abc-123",
//    timestamp: "2024-01-01T00:00:00.000Z"
//  }
// ─────────────────────────────────────────────────────────────
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('HttpExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<FastifyReply>();
    const request = ctx.getRequest<FastifyRequest & { correlationId?: string }>();

    const statusCode =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const message =
      exception instanceof HttpException
        ? this.extractMessage(exception)
        : 'Internal server error';

    // Не логируем стек для клиентских ошибок (4xx)
    if (statusCode >= 500) {
      this.logger.error(
        `${request.method} ${request.url} → ${statusCode}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    response.status(statusCode).send({
      statusCode,
      code: this.toErrorCode(statusCode),
      message,
      correlationId: request.correlationId,
      timestamp: new Date().toISOString(),
    });
  }

  private extractMessage(exception: HttpException): string {
    const response = exception.getResponse();
    if (typeof response === 'string') return response;
    if (typeof response === 'object' && 'message' in response) {
      const msg = (response as { message: string | string[] }).message;
      return Array.isArray(msg) ? msg.join('; ') : msg;
    }
    return exception.message;
  }

  private toErrorCode(statusCode: number): string {
    const codes: Record<number, string> = {
      400: 'BAD_REQUEST',
      401: 'UNAUTHORIZED',
      403: 'FORBIDDEN',
      404: 'NOT_FOUND',
      408: 'REQUEST_TIMEOUT',
      429: 'TOO_MANY_REQUESTS',
      500: 'INTERNAL_ERROR',
      502: 'BAD_GATEWAY',
      503: 'SERVICE_UNAVAILABLE',
    };
    return codes[statusCode] ?? 'UNKNOWN_ERROR';
  }
}
