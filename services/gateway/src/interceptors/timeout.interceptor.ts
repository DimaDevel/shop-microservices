import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  RequestTimeoutException,
} from '@nestjs/common';
import { Observable, throwError, TimeoutError } from 'rxjs';
import { catchError, timeout } from 'rxjs/operators';

// ─────────────────────────────────────────────────────────────
//  TimeoutInterceptor
//
//  If a downstream service does not respond within TIMEOUT_MS —
//  the request is cancelled and 408 Request Timeout is returned.
//
//  Without this, one hung service can block
//  all event loop workers in Node.js.
// ─────────────────────────────────────────────────────────────
const TIMEOUT_MS = Number(process.env.REQUEST_TIMEOUT_MS ?? 5000);

@Injectable()
export class TimeoutInterceptor implements NestInterceptor {
  intercept(_context: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(
      timeout(TIMEOUT_MS),
      catchError((err) => {
        if (err instanceof TimeoutError) {
          return throwError(
            () => new RequestTimeoutException('Upstream service timed out'),
          );
        }
        return throwError(() => err);
      }),
    );
  }
}
