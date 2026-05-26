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
//  Catches ALL HTTP exceptions (including plain Error instances)
//  and formats them into a consistent response shape.
//
//  Without the filter NestJS returns different shapes for different errors.
//  With the filter — always one shape:
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

    // Skip stack trace logging for client errors (4xx)
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
