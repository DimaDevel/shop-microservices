# NestJS Microservices Gateway

A production-grade microservices architecture built with NestJS + TypeScript, demonstrating event-driven sagas, API gateway design, and clean architecture applied to the most complex service.

## Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js 22, TypeScript |
| Framework | NestJS + Fastify adapter |
| ORM / DB | TypeORM + PostgreSQL 16 (database-per-service) |
| Cache | Redis 7 |
| Messaging | Apache Kafka (KafkaJS) |
| Auth | PassportJS + JWT (HS256, refresh token rotation) |
| Circuit breaker | opossum |
| Validation | class-validator + class-transformer |
| API docs | Swagger / OpenAPI (`@nestjs/swagger`) |
| Observability | OpenTelemetry → Jaeger |
| Reverse proxy | Nginx (rate limiting, SSL termination) |

## Services

| Service | Port | Database | Description |
|---|---|---|---|
| **gateway** | 3000 | — | Public entry point, JWT validation, proxy, circuit breaker |
| **auth-service** | 3001 | `auth_db` | Registration, login, JWT issuance, refresh token rotation |
| **user-service** | 3002 | `users_db` | User profiles |
| **product-service** | 3003 | `products_db` + Redis | Product catalog, stock management |
| **order-service** | 3004 | `orders_db` | Order management, saga orchestration |
| **pdf-service** | 3005 | — | PDF generation (stateless Kafka consumer) |
| **notification-service** | 3006 | `notifications_db` | Email/notification dispatch |
| **payment-service** | 3007 | `payments_db` | Payment processing |

Infrastructure: Nginx `:80`, Redis `:6379`, Jaeger UI `:16686`, Kafka `:9092`.

## Architecture

```
Client
  ↓
Nginx  (rate limit: 10r/m on /auth/*, 100r/m global)
  ↓
Gateway :3000  (NestJS + Fastify)
  ├── Guards:       JwtAuthGuard → RolesGuard
  ├── Interceptors: CorrelationId → Logging → Timeout (5 s → 408)
  ├── Filter:       HttpExceptionFilter
  └── ProxyService  (opossum circuit breaker per downstream)
        ├── → auth-service    :3001  (PostgreSQL: auth_db)
        ├── → user-service    :3002  (PostgreSQL: users_db)
        ├── → product-service :3003  (PostgreSQL: products_db, Redis)
        └── → order-service   :3004  (PostgreSQL: orders_db)
```

### Order saga (Kafka)

```
order-service ──[reserve-stock]──────► product-service
              ◄──[stock-reserved / stock-reservation-failed]──

order-service ──[process-payment]────► payment-service
              ◄──[payment-processed / payment-failed]──

order-service ──[order-confirmed]────► pdf-service
                                    ► notification-service
              ──[order-cancelled]───► notification-service

pdf-service   ──[pdf-generated]──────► notification-service
```

### Transactional outbox

order-service, product-service, and payment-service guarantee at-least-once Kafka delivery:
1. Business logic + outbox record written in the **same DB transaction**
2. `OutboxProcessorService` polls pending records and publishes to Kafka
3. Published records are marked `sent=true`; retries capped by `OUTBOX_MAX_RETRIES` (default 5)

product-service and payment-service also maintain an **idempotency table** to deduplicate redelivered commands.

### Authentication & identity propagation

JWT tokens are **only parsed in the gateway**. Downstream services receive trusted headers:

```
x-user-id        → user.id
x-user-email     → user.email
x-roles          → comma-separated roles (e.g. "user,admin")
x-correlation-id → trace ID for log correlation
```

### Clean Architecture (order-service)

Clean Architecture is applied to **order-service** — the most complex service in the system. The other services (auth, user, product, payment, notification) use TypeORM entities directly in their service classes, which is appropriate for their lower complexity.

order-service follows the Dependency Rule (dependencies point inward only):

```
Frameworks & Drivers  (NestJS, TypeORM, KafkaJS, PostgreSQL)
Interface Adapters    (Controllers, DTOs, entity mappers, Kafka consumers)
Use Cases             (one class per use case, orchestrates domain + repositories)
Entities              (pure domain objects, errors, repository interfaces)
```

Apply this layering to other services only when complexity justifies it — e.g., if a service grows its own saga, multi-step business rules, or needs to be tested independently of infrastructure.

## Quick Start

```bash
# Local (requires Postgres, Redis, Kafka running separately)
npm install
npm run dev

# Docker — recommended (brings up all dependencies)
cp .env.example .env     # set JWT_SECRET, JWT_REFRESH_SECRET, DB_PASSWORD
docker-compose up --build
docker-compose down
```

### Environment variables

| Variable | Default | Description |
|---|---|---|
| `JWT_SECRET` | — | Min 32 chars; gateway uses this to verify tokens |
| `JWT_REFRESH_SECRET` | — | Min 32 chars; auth-service uses for refresh tokens |
| `JWT_ACCESS_EXPIRES_IN` | `3600` | Access token lifetime (seconds) |
| `JWT_REFRESH_EXPIRES_IN` | `604800` | Refresh token lifetime (seconds) |
| `INTERNAL_SECRET` | — | Shared secret in `x-internal-secret` header; required by auth-service and user-service `InternalGuard` |
| `DB_PASSWORD` | `postgres` | PostgreSQL password |
| `AUTH_SERVICE_URL` | — | Gateway proxy target for auth |
| `USER_SERVICE_URL` | — | Gateway proxy target for users |
| `PRODUCT_SERVICE_URL` | — | Gateway proxy target for products |
| `ORDER_SERVICE_URL` | — | Gateway proxy target for orders |
| `KAFKA_BROKERS` | `localhost:9092` | Comma-separated broker list |
| `REDIS_HOST` / `REDIS_PORT` | `localhost` / `6379` | Redis for token cache and product cache |
| `OUTBOX_MAX_RETRIES` | `5` | Max Kafka publish attempts |
| `PDF_OUTPUT_DIR` | `<cwd>/pdfs` | Where pdf-service writes generated PDFs |
| `REQUEST_TIMEOUT_MS` | `5000` | Gateway per-request timeout (ms) |

### Running a single service

```bash
npm run start:dev --prefix services/gateway
npm run start:dev --prefix services/auth-service
npm run start:dev --prefix services/user-service
npm run start:dev --prefix services/product-service
npm run start:dev --prefix services/order-service
npm run start:dev --prefix services/payment-service
npm run start:dev --prefix services/pdf-service
npm run start:dev --prefix services/notification-service
```

### Tests

```bash
npm test --prefix services/order-service          # single service
npm run test:cov --prefix services/auth-service   # with coverage
```

### Load tests

Scripts live in `load-tests/k6/`. [k6](https://k6.io) must be installed once:

```bash
brew install k6
```

Start the stack using the test overlay, which exposes the gateway directly on `:3000` and bypasses Nginx rate limiting so results reflect gateway throughput, not proxy limits:

```bash
docker compose -f docker-compose.yml -f docker-compose.test.yml up -d
```

**Run order (always start with smoke):**

```bash
# 1. Smoke — 5 VUs / 30s, verifies the full stack is reachable
k6 run --env API_URL=http://localhost:3000 load-tests/k6/smoke.js

# 2. Scenario: auth service — login + refresh token rotation under load
k6 run --env API_URL=http://localhost:3000 load-tests/k6/scenarios/auth.js

# 3. Scenario: products — Redis-cached read path, target p99 < 200ms at 200 VUs
k6 run --env API_URL=http://localhost:3000 load-tests/k6/scenarios/products.js

# 4. Scenario: orders — full saga flow (requires at least one product in the DB)
k6 run --env API_URL=http://localhost:3000 load-tests/k6/scenarios/orders.js

# 5. Stress — ramps to 500 VUs to find the saturation point (~8 min)
k6 run --env API_URL=http://localhost:3000 load-tests/k6/stress.js

# 6. Soak — 100 VUs for 30 min, detects memory leaks and connection drift
k6 run --env API_URL=http://localhost:3000 load-tests/k6/soak.js
```

**What to watch during a run:**

| Signal | Command |
|---|---|
| Container CPU / memory | `docker stats` |
| Circuit breaker state | `curl localhost:3000/health` |
| Gateway logs | `docker compose logs -f gateway` |

> **Note:** `scenarios/orders.js` polls until the saga completes (`pending` → `confirmed` or `cancelled`). It requires at least one product in the database — create one via `POST /products` with an admin token before running this scenario.

---

## Swagger UI

Interactive API docs available at **`http://localhost:3000/api`** (or `http://localhost/api` via Nginx).

All protected endpoints require a **Bearer JWT**. Obtain one from `POST /auth/login`, then click **Authorize** in Swagger.

---

## API Reference

All endpoints are served through the **gateway** at `http://localhost:3000`.

> `🔓 Public` — no token required  
> `🔒 JWT` — `Authorization: Bearer <token>` required  
> `👑 Admin` — JWT + `admin` role required

---

### Health

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/health` | 🔓 Public | Memory heap + circuit breaker state for all downstream services |

Response `200`:
```json
{
  "status": "ok",
  "info": {
    "memory_heap": { "status": "up" },
    "circuit_breakers": {
      "status": "up",
      "auth": { "state": "closed" },
      "users": { "state": "closed" },
      "products": { "state": "closed" },
      "orders": { "state": "closed" }
    }
  }
}
```

Response `503` when any circuit breaker is open.

---

### Auth

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/auth/register` | 🔓 Public | Create a new account |
| `POST` | `/auth/login` | 🔓 Public | Obtain access + refresh tokens |
| `POST` | `/auth/refresh` | 🔓 Public | Exchange refresh token for a new token pair |
| `POST` | `/auth/logout` | 🔒 JWT | Invalidate the stored refresh token |

**`POST /auth/register`**

```json
// Request body
{ "email": "user@example.com", "password": "password123" }

// Response 201
{
  "user": { "id": "<uuid>", "email": "user@example.com", "roles": ["user"] },
  "tokens": { "accessToken": "<jwt>", "refreshToken": "<jwt>" }
}
// Error 409 — email already in use
```

**`POST /auth/login`**

```json
// Request body
{ "email": "user@example.com", "password": "password123" }

// Response 200 — same shape as register
// Error 401 — invalid credentials
```

**`POST /auth/refresh`**

```json
// Request body
{ "refreshToken": "<jwt>" }

// Response 200
{ "accessToken": "<jwt>", "refreshToken": "<jwt>" }
// Error 401 — token invalid or expired
```

**`POST /auth/logout`** — no body; requires `Authorization: Bearer <token>`.

```json
// Response 200
{ "message": "Logged out successfully" }
```

---

### Users

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/users/:id` | 🔒 JWT | Get a user profile by UUID |
| `PATCH` | `/users/:id` | 🔒 JWT | Update own profile (all fields optional) |
| `DELETE` | `/users/:id` | 👑 Admin | Delete a user |

**`GET /users/:id`** — Response `200`:

```json
{
  "id": "<uuid>",
  "email": "user@example.com",
  "name": "John Doe",
  "avatarUrl": "https://example.com/avatar.png",
  "phone": "+14155552671",
  "dateOfBirth": "1990-01-15",
  "addressLine": "123 Main St",
  "city": "San Francisco",
  "country": "US",
  "postalCode": "94105",
  "createdAt": "2024-01-01T00:00:00.000Z"
}
```

**`PATCH /users/:id`** — all fields optional:

```json
{
  "name": "John Doe",
  "avatarUrl": "https://example.com/avatar.png",
  "phone": "+14155552671",
  "dateOfBirth": "1990-01-15",
  "addressLine": "123 Main St",
  "city": "San Francisco",
  "country": "US",
  "postalCode": "94105"
}
```

---

### Products

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/products` | 🔒 JWT | List all products |
| `GET` | `/products/:id` | 🔒 JWT | Get a product by UUID |
| `POST` | `/products` | 👑 Admin | Create a product |
| `PATCH` | `/products/:id` | 👑 Admin | Update a product (all fields optional) |
| `DELETE` | `/products/:id` | 👑 Admin | Delete a product |

**`POST /products`**

```json
// Request body
{
  "name": "Wireless Headphones",
  "description": "Premium noise-cancelling wireless headphones",
  "price": 99.99,
  "stock": 42
}

// Response 201
{
  "id": "<uuid>",
  "name": "Wireless Headphones",
  "description": "Premium noise-cancelling wireless headphones",
  "price": 99.99,
  "stock": 42,
  "createdAt": "2024-01-01T00:00:00.000Z"
}
```

**`PATCH /products/:id`** — all fields optional:

```json
{ "name": "Wireless Headphones Pro", "price": 119.99, "stock": 100 }
```

---

### Orders

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/orders` | 🔒 JWT | Place a new order (triggers the order saga) |
| `GET` | `/orders` | 🔒 JWT | List orders for the authenticated user |
| `GET` | `/orders/:id` | 🔒 JWT | Get a specific order by UUID |

**`POST /orders`**

```json
// Request body
{
  "items": [
    { "productId": "<uuid>", "quantity": 2 },
    { "productId": "<uuid>", "quantity": 1 }
  ]
}

// Response 201 — saga initiated, status starts as "pending"
{
  "id": "<uuid>",
  "userId": "<uuid>",
  "status": "pending",
  "items": [
    { "productId": "<uuid>", "name": "Wireless Headphones", "quantity": 2, "unitPrice": 99.99 }
  ],
  "total": 199.98,
  "createdAt": "2024-01-01T00:00:00.000Z"
}
```

Order `status` lifecycle: `pending` → `confirmed` (stock reserved + payment processed) or `cancelled` (stock/payment failed).

---

## Error format

All errors are normalised by `HttpExceptionFilter`:

```json
{
  "statusCode": 401,
  "code": "UNAUTHORIZED",
  "message": "Invalid or missing token",
  "correlationId": "550e8400-e29b-41d4-a716-446655440000",
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

---

## Internal Kafka services

These services are not reachable from outside Docker; they communicate only via Kafka topics.

| Service | Consumes | Produces |
|---|---|---|
| **product-service** | `orders.reserve-stock`, `orders.release-stock` | `orders.stock-reserved`, `orders.stock-reservation-failed`, `orders.stock-released` |
| **payment-service** | `orders.process-payment` | `orders.payment-processed`, `orders.payment-failed` |
| **pdf-service** | `orders.order-confirmed` | `pdf.pdf-generated` |
| **notification-service** | `orders.order-confirmed`, `orders.order-cancelled`, `pdf.pdf-generated` | — |

---

## Observability

| Tool | URL | Notes |
|---|---|---|
| Jaeger UI | `http://localhost:16686` | Distributed traces via OpenTelemetry |
| Swagger UI | `http://localhost:3000/api` | Interactive API docs |
| Health check | `http://localhost:3000/health` | Memory heap + circuit breaker status |

Structured logs: every request includes `x-correlation-id`, HTTP method, path, status code, and response time.

---

## NestJS patterns

### Guards (execution order)

| Guard | Scope | Responsibility |
|---|---|---|
| `JwtAuthGuard` | Global | Validates Bearer token, sets `req.user`; skips `@Public()` routes |
| `RolesGuard` | Global | Checks `@Roles()` metadata against `req.user.roles` |

### Interceptors (execution order)

| Interceptor | Responsibility |
|---|---|
| `CorrelationIdInterceptor` | Reads or generates `x-correlation-id`, adds it to the response |
| `LoggingInterceptor` | Logs method, path, status code, response time |
| `TimeoutInterceptor` | Returns 408 if downstream doesn't respond within `REQUEST_TIMEOUT_MS` |

### Shared decorators (`@nest-gateway/shared`)

```typescript
@Public()              // Skip JwtAuthGuard on this route
@Roles(Role.ADMIN)     // Require the admin role
@CurrentUser()         // Inject req.user as a method parameter
```

### Database-per-service

| Database | Tables | Notes |
|---|---|---|
| `auth_db` | `users` | `passwordHash` has `select: false`; use `addSelect()` when needed |
| `users_db` | `profiles` | Profile/display data; no JWT dependency |
| `products_db` | `products`, `outbox`, `idempotency` | Redis cache layer |
| `orders_db` | `orders`, `order_items`, `sagas`, `outbox` | Saga state machine |
| `payments_db` | `payments`, `outbox`, `idempotency` | Transactional outbox |
| `notifications_db` | `notifications` | Delivery log |
