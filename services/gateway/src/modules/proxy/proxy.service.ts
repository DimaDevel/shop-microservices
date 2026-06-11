import {
  Injectable,
  Logger,
  ServiceUnavailableException,
  BadGatewayException,
  HttpException,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import CircuitBreaker from 'opossum';
import { HEADERS, RequestUser } from '@nest-gateway/shared';

interface ProxyRequestOptions {
  method: string;
  path: string;
  body?: unknown;
  user?: RequestUser;
  correlationId?: string;
  headers?: Record<string, string>;
}

type ServiceName = 'authService' | 'userService' | 'productService' | 'orderService' | 'paymentService';

@Injectable()
export class ProxyService implements OnModuleInit {
  private readonly logger = new Logger(ProxyService.name);
  private readonly breakers = new Map<ServiceName, CircuitBreaker>();

  private readonly serviceUrls: Record<ServiceName, string>;

  constructor(private config: ConfigService) {
    this.serviceUrls = {
      authService: config.getOrThrow<string>('AUTH_SERVICE_URL'),
      userService: config.getOrThrow<string>('USER_SERVICE_URL'),
      productService: config.getOrThrow<string>('PRODUCT_SERVICE_URL'),
      orderService: config.getOrThrow<string>('ORDER_SERVICE_URL'),
      paymentService: config.getOrThrow<string>('PAYMENT_SERVICE_URL'),
    };
  }

  onModuleInit() {
    // Initialise a circuit breaker for each service
    for (const [name, _url] of Object.entries(this.serviceUrls)) {
      const breaker = new CircuitBreaker(async (fn: () => Promise<Response>) => fn(), {
        name,
        timeout: 4500,
        errorThresholdPercentage: 50,
        resetTimeout: 30000,
        volumeThreshold: 5,
      });

      breaker.on('open', () => this.logger.warn(`Circuit breaker OPEN: ${name}`));
      breaker.on('halfOpen', () => this.logger.log(`Circuit breaker HALF-OPEN: ${name}`));
      breaker.on('close', () => this.logger.log(`Circuit breaker CLOSED: ${name}`));

      this.breakers.set(name as ServiceName, breaker);
    }
  }

  async proxyToAuth(options: ProxyRequestOptions) {
    return this.proxy('authService', options);
  }

  async proxyToUsers(options: ProxyRequestOptions) {
    return this.proxy('userService', options);
  }

  async proxyToProducts(options: ProxyRequestOptions) {
    return this.proxy('productService', options);
  }

  async proxyToOrders(options: ProxyRequestOptions) {
    return this.proxy('orderService', options);
  }

  async proxyToPayments(options: ProxyRequestOptions) {
    return this.proxy('paymentService', options);
  }

  getBreakersStatus() {
    const status: Record<string, object> = {};
    for (const [name, breaker] of this.breakers) {
      status[name] = {
        state: breaker.opened ? 'open' : breaker.halfOpen ? 'half-open' : 'closed',
        stats: {
          fires: breaker.stats.fires,
          failures: breaker.stats.failures,
          successes: breaker.stats.successes,
          rejects: breaker.stats.rejects,
        },
      };
    }
    return status;
  }

  private async proxy(service: ServiceName, options: ProxyRequestOptions) {
    const { method, path, body, user, correlationId, headers = {} } = options;
    const baseUrl = this.serviceUrls[service];
    const url = `${baseUrl}${path}`;
    const breaker = this.breakers.get(service)!;

    const proxyHeaders: Record<string, string> = {
      ...(body ? { 'content-type': 'application/json' } : {}),
      [HEADERS.INTERNAL_SECRET]: this.config.getOrThrow<string>('INTERNAL_SECRET'),
      ...(correlationId && { [HEADERS.CORRELATION_ID]: correlationId }),
      ...(user && {
        [HEADERS.USER_ID]: user.id,
        [HEADERS.USER_EMAIL]: user.email,
        [HEADERS.USER_ROLES]: user.roles.join(','),
      }),
      ...headers,
    };

    let response: Response;
    try {
      response = (await breaker.fire(() =>
        fetch(url, {
          method,
          headers: proxyHeaders,
          body: body ? JSON.stringify(body) : undefined,
        }),
      )) as Response;
    } catch (err) {
      const error = err as Error & { code?: string };
      if (error.code === 'EOPENBREAKER' || error.message?.includes('Breaker is open')) {
        this.logger.warn(`Circuit breaker open for ${service}`);
        throw new ServiceUnavailableException(`${service} is temporarily unavailable`);
      }
      // Network-level failure: service is down or unreachable
      this.logger.error(`Cannot reach ${service} at ${url}: ${error.message}`);
      throw new ServiceUnavailableException(`${service} is unreachable`);
    }

    let data: unknown = null;
    if (response.status !== 204 && response.headers.get('content-length') !== '0') {
      try {
        data = await response.json();
      } catch {
        this.logger.error(`${service} returned non-JSON response (status ${response.status})`);
        throw new BadGatewayException(`${service} returned an invalid response`);
      }
    }

    if (response.status >= 400) {
      throw new HttpException(data ?? response.statusText, response.status);
    }

    return { status: response.status, data };
  }
}
