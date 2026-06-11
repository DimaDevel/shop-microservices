import { Test, TestingModule } from '@nestjs/testing';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { ValidationPipe } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule } from '@nestjs/config';
import { getRepositoryToken } from '@nestjs/typeorm';
import { APP_GUARD } from '@nestjs/core';
import { Reflector } from '@nestjs/core';
import { createHash } from 'crypto';
import * as bcrypt from 'bcrypt';
import { AuthController } from '../src/auth/auth.controller';
import { AuthService } from '../src/auth/auth.service';
import { UserEntity } from '../src/users/user.entity';
import { InternalGuard } from '../src/guards/internal.guard';
import { HEADERS, Role } from '@nest-gateway/shared';

const INTERNAL_SECRET = 'test-internal-secret-value';
const JWT_SECRET = 'test-jwt-secret-min-32-chars-long!!';
const JWT_REFRESH_SECRET = 'test-refresh-secret-32-chars-long!';

describe('Auth (e2e)', () => {
  let app: NestFastifyApplication;

  const mockUser: UserEntity = {
    id: 'uuid-e2e-1',
    email: 'e2e@example.com',
    passwordHash: '',
    roles: [Role.USER],
    isActive: true,
    refreshToken: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockRepo = {
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    update: jest.fn(),
    createQueryBuilder: jest.fn(),
  };

  const mockQb = {
    addSelect: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    getOne: jest.fn(),
  };

  beforeAll(async () => {
    mockUser.passwordHash = await bcrypt.hash('password123', 12);

    const moduleFixture: TestingModule = await Test.createTestingModule({
      // Cast to any: @nestjs/config and @nestjs/jwt are hoisted to root node_modules and
      // return DynamicModule typed against @nestjs/common@10, while @nestjs/testing here
      // resolves @nestjs/common@11 — both are compatible at runtime.
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          load: [
            () => ({
              JWT_SECRET,
              JWT_REFRESH_SECRET,
              JWT_ACCESS_EXPIRES_IN: 3600,
              JWT_REFRESH_EXPIRES_IN: 604800,
              INTERNAL_SECRET,
            }),
          ],
        }) as any,
        JwtModule.register({ secret: JWT_SECRET, signOptions: { expiresIn: 3600 } }) as any,
      ],
      controllers: [AuthController],
      providers: [
        AuthService,
        Reflector,
        { provide: getRepositoryToken(UserEntity), useValue: mockRepo },
        { provide: APP_GUARD, useClass: InternalGuard },
      ],
    }).compile();

    app = moduleFixture.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => {
    await app?.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockRepo.createQueryBuilder.mockReturnValue(mockQb);
  });

  describe('GET /auth/health', () => {
    it('returns 200 without internal secret (public endpoint)', async () => {
      const res = await app.inject({ method: 'GET', url: '/auth/health' });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ status: 'ok', service: 'auth-service' });
    });
  });

  describe('POST /auth/register', () => {
    it('returns 401 without internal secret', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/auth/register',
        payload: { email: 'new@example.com', password: 'password123' },
      });

      expect(res.statusCode).toBe(401);
    });

    it('returns 400 for invalid email', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/auth/register',
        headers: { [HEADERS.INTERNAL_SECRET]: INTERNAL_SECRET },
        payload: { email: 'not-an-email', password: 'password123' },
      });

      expect(res.statusCode).toBe(400);
    });

    it('returns 400 for password shorter than 8 chars', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/auth/register',
        headers: { [HEADERS.INTERNAL_SECRET]: INTERNAL_SECRET },
        payload: { email: 'new@example.com', password: 'short' },
      });

      expect(res.statusCode).toBe(400);
    });

    it('returns 400 for unknown fields (forbidNonWhitelisted)', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/auth/register',
        headers: { [HEADERS.INTERNAL_SECRET]: INTERNAL_SECRET },
        payload: { email: 'new@example.com', password: 'password123', extra: 'field' },
      });

      expect(res.statusCode).toBe(400);
    });

    it('returns 201 with tokens on success', async () => {
      mockRepo.findOne.mockResolvedValue(null);
      mockRepo.create.mockReturnValue(mockUser);
      mockRepo.save.mockResolvedValue(mockUser);
      mockRepo.update.mockResolvedValue(undefined);

      const res = await app.inject({
        method: 'POST',
        url: '/auth/register',
        headers: { [HEADERS.INTERNAL_SECRET]: INTERNAL_SECRET },
        payload: { email: 'new@example.com', password: 'password123' },
      });

      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body.accessToken).toBeDefined();
      expect(body.refreshToken).toBeDefined();
      expect(body.expiresIn).toBe(3600);
    });

    it('returns 409 when email is already taken', async () => {
      mockRepo.findOne.mockResolvedValue(mockUser);

      const res = await app.inject({
        method: 'POST',
        url: '/auth/register',
        headers: { [HEADERS.INTERNAL_SECRET]: INTERNAL_SECRET },
        payload: { email: 'e2e@example.com', password: 'password123' },
      });

      expect(res.statusCode).toBe(409);
    });
  });

  describe('POST /auth/login', () => {
    it('returns 200 with tokens for valid credentials', async () => {
      mockQb.getOne.mockResolvedValue(mockUser);
      mockRepo.update.mockResolvedValue(undefined);

      const res = await app.inject({
        method: 'POST',
        url: '/auth/login',
        headers: { [HEADERS.INTERNAL_SECRET]: INTERNAL_SECRET },
        payload: { email: 'e2e@example.com', password: 'password123' },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().accessToken).toBeDefined();
    });

    it('returns 401 when user is not found', async () => {
      mockQb.getOne.mockResolvedValue(null);

      const res = await app.inject({
        method: 'POST',
        url: '/auth/login',
        headers: { [HEADERS.INTERNAL_SECRET]: INTERNAL_SECRET },
        payload: { email: 'nobody@example.com', password: 'password123' },
      });

      expect(res.statusCode).toBe(401);
    });

    it('returns 401 when password is wrong', async () => {
      mockQb.getOne.mockResolvedValue(mockUser);

      const res = await app.inject({
        method: 'POST',
        url: '/auth/login',
        headers: { [HEADERS.INTERNAL_SECRET]: INTERNAL_SECRET },
        payload: { email: 'e2e@example.com', password: 'wrongpassword' },
      });

      expect(res.statusCode).toBe(401);
    });
  });

  describe('POST /auth/refresh', () => {
    it('returns 401 for an invalid/expired refresh token', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/auth/refresh',
        headers: { [HEADERS.INTERNAL_SECRET]: INTERNAL_SECRET },
        payload: { refreshToken: 'invalid.token.string' },
      });

      expect(res.statusCode).toBe(401);
    });

    it('returns 200 with new tokens for a valid refresh token', async () => {
      // Login first to get a real signed refresh token
      mockQb.getOne.mockResolvedValue(mockUser);
      mockRepo.update.mockResolvedValue(undefined);

      const loginRes = await app.inject({
        method: 'POST',
        url: '/auth/login',
        headers: { [HEADERS.INTERNAL_SECRET]: INTERNAL_SECRET },
        payload: { email: 'e2e@example.com', password: 'password123' },
      });
      const { refreshToken } = loginRes.json();

      // Simulate the stored hashed token matching
      const storedHash = createHash('sha256').update(refreshToken).digest('hex');
      mockRepo.findOne.mockResolvedValue({ ...mockUser, refreshToken: storedHash });
      mockRepo.update.mockResolvedValue(undefined);

      const res = await app.inject({
        method: 'POST',
        url: '/auth/refresh',
        headers: { [HEADERS.INTERNAL_SECRET]: INTERNAL_SECRET },
        payload: { refreshToken },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().accessToken).toBeDefined();
    });

    it('returns 401 when refresh token has been revoked', async () => {
      // Login to get a valid signed token
      mockQb.getOne.mockResolvedValue(mockUser);
      mockRepo.update.mockResolvedValue(undefined);

      const loginRes = await app.inject({
        method: 'POST',
        url: '/auth/login',
        headers: { [HEADERS.INTERNAL_SECRET]: INTERNAL_SECRET },
        payload: { email: 'e2e@example.com', password: 'password123' },
      });
      const { refreshToken } = loginRes.json();

      // Simulate revoked: no user found for this token hash
      mockRepo.findOne.mockResolvedValue(null);

      const res = await app.inject({
        method: 'POST',
        url: '/auth/refresh',
        headers: { [HEADERS.INTERNAL_SECRET]: INTERNAL_SECRET },
        payload: { refreshToken },
      });

      expect(res.statusCode).toBe(401);
    });
  });

  describe('POST /auth/logout', () => {
    it('returns 200 on success', async () => {
      mockRepo.update.mockResolvedValue(undefined);

      const res = await app.inject({
        method: 'POST',
        url: '/auth/logout',
        headers: {
          [HEADERS.INTERNAL_SECRET]: INTERNAL_SECRET,
          [HEADERS.USER_ID]: 'uuid-e2e-1',
        },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ message: 'Logged out successfully' });
    });

    it('returns 400 when user id header is missing', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/auth/logout',
        headers: { [HEADERS.INTERNAL_SECRET]: INTERNAL_SECRET },
      });

      expect(res.statusCode).toBe(400);
    });
  });
});
