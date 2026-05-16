# NestJS Microservices Gateway

Микросервисная архитектура на NestJS + TypeScript с акцентом на паттерны.

## Стек
- **NestJS** + **Fastify** adapter (вместо Express — быстрее)
- **TypeORM** + **PostgreSQL** (database-per-service)
- **PassportJS** + JWT (RS256 в продакшне)
- **opossum** Circuit Breaker
- **class-validator** + **class-transformer** для DTO

## Архитектура

```
Client
  ↓
Nginx  (rate limit, SSL)
  ↓
Gateway (NestJS)
  ├── Guards:       JwtAuthGuard → RolesGuard
  ├── Interceptors: CorrelationId → Logging → Timeout
  ├── Filter:       HttpExceptionFilter
  └── ProxyService (Circuit Breaker)
        ├── → Auth Service (NestJS + PostgreSQL)
        └── → User Service (NestJS + PostgreSQL)
```

## NestJS паттерны в проекте

### Guards (в порядке выполнения)
| Guard | Где | Что делает |
|---|---|---|
| `JwtAuthGuard` | Global | Проверяет JWT, поддерживает `@Public()` |
| `RolesGuard` | Global | Проверяет роли из `@Roles()` метаданных |

### Interceptors (в порядке выполнения)
| Interceptor | Что делает |
|---|---|
| `CorrelationIdInterceptor` | Генерирует/читает `x-correlation-id`, добавляет в ответ |
| `LoggingInterceptor` | Логирует метод, путь, статус, время ответа |
| `TimeoutInterceptor` | 408 если downstream не ответил за 5 сек |

### Декораторы (shared пакет)
```typescript
@Public()              // Отключить JwtAuthGuard для роута
@Roles(Role.ADMIN)     // Требовать роль
@CurrentUser()         // Получить req.user как параметр
```

### Фильтры
`HttpExceptionFilter` — единый формат всех ошибок:
```json
{
  "statusCode": 401,
  "code": "UNAUTHORIZED",
  "message": "Invalid or missing token",
  "correlationId": "550e8400-e29b-41d4-a716-446655440000",
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

## Запуск

```bash
# Локально
npm install
npm run dev

# Docker (рекомендуется)
cp .env.example .env
docker-compose up --build
```

## .env.example

```
JWT_SECRET=dev-secret-must-be-32-chars-min
JWT_REFRESH_SECRET=refresh-secret-must-be-32-chars
DB_PASSWORD=postgres
```

## API

```
POST /auth/register     { email, password }
POST /auth/login        { email, password } → { accessToken, refreshToken }
POST /auth/refresh      { refreshToken }

GET    /users/:id        JWT required
PATCH  /users/:id        JWT required, owner or admin
DELETE /users/:id        JWT required, ADMIN only

GET    /health           Circuit breaker status
```

## Database-per-service

Каждый сервис имеет **свою** PostgreSQL базу. Это ключевой паттерн микросервисов — сервисы не шарят БД, у каждого своя схема и жизненный цикл миграций.

```
auth-db  → таблица users   (email, passwordHash, roles, refreshToken)
users-db → таблица profiles (id, email, name, avatarUrl)
```
