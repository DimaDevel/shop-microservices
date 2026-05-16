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

# Docker (recommended for full stack with DBs)
cp .env.example .env   # set JWT_SECRET, JWT_REFRESH_SECRET, DB_PASSWORD
docker-compose up --build
docker-compose down

# Run a single service in dev mode
npm run start:dev --prefix services/gateway
npm run start:dev --prefix services/auth-service
npm run start:dev --prefix services/user-service

# Build a single service
npm run build --prefix services/gateway
```

Required env vars for local dev (services read from process.env via ConfigService):
- `JWT_SECRET` — min 32 chars, used by gateway to verify tokens
- `JWT_REFRESH_SECRET` — min 32 chars, used by auth-service for refresh tokens
- `DB_PASSWORD` — PostgreSQL password (default: `postgres`)
- `AUTH_SERVICE_URL` / `USER_SERVICE_URL` — gateway points to these (defaults set in docker-compose)

## Architecture

This is an **npm workspaces monorepo** with three NestJS services and one shared package:

```
packages/shared/          ← @nest-gateway/shared — shared types, decorators, constants
services/gateway/         ← Public entry point (port 3000), NestJS + Fastify
services/auth-service/    ← Auth logic + JWT issuance (port 3001), has own PostgreSQL
services/user-service/    ← User profiles (port 3002), has own PostgreSQL
nginx/                    ← Rate limiting (10r/m on /auth/*, 100r/m global), SSL termination
```

### Request flow

```
Client → Nginx → Gateway → auth-service (PostgreSQL: auth_db)
                         → user-service (PostgreSQL: users_db)
```

The gateway is the **only** service exposed publicly. Downstream services live on the `internal` Docker network.

### Gateway middleware stack (execution order)

All registered globally in `services/gateway/src/app.module.ts`:

1. **Guards**: `JwtAuthGuard` (validates Bearer token, sets `req.user`) → `RolesGuard` (checks `@Roles()` metadata)
2. **Interceptors**: `CorrelationIdInterceptor` → `LoggingInterceptor` → `TimeoutInterceptor` (5s, returns 408)
3. **Filter**: `HttpExceptionFilter` — normalises all errors to `{ statusCode, code, message, correlationId, timestamp }`

### Authentication and identity propagation

JWT tokens are **only parsed in the gateway** (`JwtStrategy` → `req.user: RequestUser`). Downstream services never see or verify JWTs. Instead, the gateway enriches every proxied request with trusted headers (defined in `packages/shared/src/constants/index.ts`):

```
x-user-id     → user.id
x-user-email  → user.email
x-roles       → comma-separated roles (e.g. "user,admin")
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

Imported by all three services. Contains:

- **Decorators**: `@Public()` (skip JWT guard), `@Roles(...Role[])` (role requirement), `@CurrentUser()` (param decorator for `req.user`)
- **Interfaces**: `JwtPayload`, `RequestUser`, `ApiError`
- **Constants**: `HEADERS` object (canonical header names), `Role` enum (`user | admin | moderator`)

When adding a new route: mark public endpoints with `@Public()`, restrict by role with `@Roles(Role.ADMIN)`, and access the authenticated user with `@CurrentUser() user: RequestUser`.

### ValidationPipe

The gateway uses `ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true })` globally. All gateway DTO classes must use `class-validator` decorators; unknown fields are rejected with 400.
