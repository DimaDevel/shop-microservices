# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Install dependencies (from repo root)
npm install

# Run all services in watch mode concurrently
npm run dev

# Build all workspaces
npm run build

# Docker (recommended for full stack with DBs, Kafka, and Redis)
cp .env.example .env   # set JWT_SECRET, JWT_REFRESH_SECRET, DB_PASSWORD
docker-compose up --build
docker-compose down

# Run a single service in dev mode
npm run start:dev --prefix services/gateway
npm run start:dev --prefix services/auth-service
npm run start:dev --prefix services/user-service
npm run start:dev --prefix services/product-service
npm run start:dev --prefix services/order-service
npm run start:dev --prefix services/payment-service
npm run start:dev --prefix services/pdf-service
npm run start:dev --prefix services/notification-service

# Run tests
npm test --prefix services/order-service         # single service
npm run test:cov --prefix services/auth-service  # with coverage
```

Required env vars for local dev (services read from process.env via ConfigService):

- `JWT_SECRET` — min 32 chars, used by gateway to verify tokens
- `JWT_REFRESH_SECRET` — min 32 chars, used by auth-service for refresh tokens
- `JWT_ACCESS_EXPIRES_IN` — access token lifetime in seconds (default: `3600`)
- `JWT_REFRESH_EXPIRES_IN` — refresh token lifetime in seconds (default: `604800`)
- `INTERNAL_SECRET` — shared secret sent by gateway in `x-internal-secret` header; required by auth-service and user-service `InternalGuard`
- `DB_PASSWORD` — PostgreSQL password (default: `postgres`)
- `AUTH_SERVICE_URL` / `USER_SERVICE_URL` / `PRODUCT_SERVICE_URL` / `ORDER_SERVICE_URL` — gateway points to these (defaults set in docker-compose)
- `KAFKA_BROKERS` — comma-separated broker list (default: `localhost:9092`); used by order-service, product-service, payment-service, pdf-service, notification-service
- `REDIS_HOST` / `REDIS_PORT` — used by gateway (token cache) and product-service (cache); defaults `localhost` / `6379`
- `OUTBOX_MAX_RETRIES` — max Kafka publish attempts for the transactional outbox (default: `5`)
- `PDF_OUTPUT_DIR` — directory where pdf-service writes generated PDFs (default: `<cwd>/pdfs`)
- `REQUEST_TIMEOUT_MS` — gateway per-request timeout in ms (default: `5000`)

## Architecture

This is an **npm workspaces monorepo** with eight NestJS services and one shared package:

```
packages/shared/               ← @nest-gateway/shared — shared types, decorators, constants, Kafka topics
services/gateway/              ← Public entry point (port 3000), NestJS + Fastify
services/auth-service/         ← Auth logic + JWT issuance (port 3001), PostgreSQL: auth_db
services/user-service/         ← User profiles (port 3002), PostgreSQL: users_db
services/product-service/      ← Product catalog + stock management (port 3003), PostgreSQL + Redis cache
services/order-service/        ← Order management + saga orchestration (port 3004), PostgreSQL
services/pdf-service/          ← PDF generation (port 3005), stateless Kafka consumer
services/notification-service/ ← Email/notification dispatch (port 3006), PostgreSQL
services/payment-service/      ← Payment processing (port 3007), PostgreSQL
nginx/                         ← Rate limiting (10r/m on /auth/*, 100r/m global), SSL termination
```

### Request flow

```
Client → Nginx → Gateway → auth-service    (PostgreSQL: auth_db)
                         → user-service    (PostgreSQL: users_db)
                         → product-service (PostgreSQL: products_db, Redis cache)
                         → order-service   (PostgreSQL: orders_db, Kafka producer)

Order saga (Kafka):
  order-service ──[reserve-stock]──► product-service ──[stock-reserved/failed]──► order-service
                ──[process-payment]─► payment-service ──[payment-processed/failed]► order-service
                ──[order-confirmed]─► pdf-service ──[pdf-generated]──► notification-service
                ──[order-cancelled]─► notification-service
```

The gateway is the **only** service exposed publicly. Downstream services live on the `internal` Docker network.

### Kafka topics (defined in `packages/shared/src/constants/index.ts`)

Commands (orchestrator → participant):
- `orders.reserve-stock` / `orders.release-stock` — order-service → product-service
- `orders.process-payment` — order-service → payment-service

Replies (participant → orchestrator):
- `orders.stock-reserved` / `orders.stock-reservation-failed` / `orders.stock-released` — product-service → order-service
- `orders.payment-processed` / `orders.payment-failed` — payment-service → order-service

Domain events (broadcast):
- `orders.order-confirmed` / `orders.order-cancelled` — order-service → pdf-service, notification-service
- `pdf.pdf-generated` — pdf-service → notification-service

### Transactional outbox pattern

order-service, product-service, and payment-service guarantee at-least-once Kafka delivery via an outbox:
1. Business logic and an outbox record are written **in the same DB transaction**
2. `OutboxProcessorService` polls pending records and publishes them to Kafka
3. Published records are marked `sent=true`; retries are capped by `OUTBOX_MAX_RETRIES`

product-service and payment-service also maintain an **idempotency table** to deduplicate redelivered commands.

### Gateway middleware stack (execution order)

All registered globally in `services/gateway/src/app.module.ts`:

1. **Guards**: `JwtAuthGuard` (validates Bearer token, sets `req.user`) → `RolesGuard` (checks `@Roles()` metadata)
2. **Interceptors**: `CorrelationIdInterceptor` → `LoggingInterceptor` → `TimeoutInterceptor` (5s, returns 408)
3. **Filter**: `HttpExceptionFilter` — normalises all errors to `{ statusCode, code, message, correlationId, timestamp }`

### Authentication and identity propagation

JWT tokens are **only parsed in the gateway** (`JwtStrategy` → `req.user: RequestUser`). Downstream services never see or verify JWTs. Instead, the gateway enriches every proxied request with trusted headers (defined in `packages/shared/src/constants/index.ts`):

```
x-user-id        → user.id
x-user-email     → user.email
x-roles          → comma-separated roles (e.g. "user,admin")
x-correlation-id → trace ID for log correlation
```

User-service reads these headers directly — it has no JWT dependency.

### Circuit breaker

`ProxyService` (`services/gateway/src/modules/proxy/proxy.service.ts`) wraps each downstream with an **opossum** circuit breaker:

- Opens after 50% error rate over a minimum of 5 calls
- Resets after 30 seconds
- Throws `ServiceUnavailableException` when open
- `GET /health` exposes breaker state for each service

### Database-per-service

- `auth_db` — `users` table: `id, email, passwordHash (select:false), roles[], refreshToken, isActive`
- `users_db` — `profiles` table: user profile/display data

`passwordHash` has `select: false` in TypeORM; use `createQueryBuilder().addSelect('user.passwordHash')` when you need it (see `AuthService.login`).

Auth-service uses a **refresh token rotation** pattern: the current refresh token is stored in the DB and invalidated on every use.

### Shared package (`@nest-gateway/shared`)

Imported by all services. Contains:

- **Decorators**: `@Public()` (skip JWT guard), `@Roles(...Role[])` (role requirement), `@CurrentUser()` (param decorator for `req.user`)
- **Interfaces**: `JwtPayload`, `RequestUser`, `ApiError`, Kafka command/event payload types
- **Constants**: `HEADERS` object (canonical header names), `Role` enum (`user | admin | moderator`), `KAFKA_TOPICS`

When adding a new route: mark public endpoints with `@Public()`, restrict by role with `@Roles(Role.ADMIN)`, and access the authenticated user with `@CurrentUser() user: RequestUser`.

### ValidationPipe

The gateway uses `ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true })` globally. All gateway DTO classes must use `class-validator` decorators; unknown fields are rejected with 400.

## Clean Architecture (order-service only)

Clean Architecture is applied to **order-service** — the most complex service due to its saga orchestration and multi-step business rules. The other services (auth, user, product, payment, notification) use TypeORM entities directly in their service classes; do not refactor them toward CA unless their complexity grows to justify it.

For order-service, the Dependency Rule applies: **source code dependencies must point inward only**.

```
Frameworks & Drivers  (NestJS, Fastify, TypeORM, KafkaJS, PostgreSQL)
Interface Adapters    (Controllers, DTOs, entity mappers, Kafka consumers)
Use Cases             (Use-case classes, application services, input/output types)
Entities              (Domain entities, errors, repository interfaces)
```

Canonical folder layout (exemplified by order-service):

```
src/orders/
  domain/
    entities/     ← pure domain objects (Order, Saga, OrderItem)
    errors/       ← domain error classes extending Error
    repositories/ ← repository interfaces (no TypeORM imports)
  application/
    use-cases/    ← one class per use case, orchestrates domain + repositories
    services/     ← saga orchestrator and other application-level services
  infrastructure/
    persistence/  ← TypeORM ORM entities, mappers, repository implementations
  orders.module.ts
```

Rules:

- **DTOs belong to the Interface Adapter layer.** They carry `class-validator`/`class-transformer` decorators; never import a DTO inside a service.
- **Services define their own input types** (plain interfaces). Controllers map DTOs → inputs; the service never knows the DTO exists.
- **Entities are the innermost layer.** Must not import from services, controllers, or DTOs.
- **Services throw domain errors** (`*.errors.ts`). HTTP exceptions belong in the controller — never in the service.
- **Services return plain interfaces** (`*.outputs.ts`), never DTOs or TypeORM entities.

## Promise.all vs Promise.allSettled

Use `Promise.all` when all operations must succeed together (fail fast on first rejection). Use `Promise.allSettled` when operations are independent and partial success is useful — but always check each result's `status` field explicitly, since `Promise.allSettled` always resolves regardless of failures.

# Compact instructions

When you are using compact, please focus on test output and code changes
