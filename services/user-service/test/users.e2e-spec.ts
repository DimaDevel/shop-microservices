import { Test, TestingModule } from '@nestjs/testing';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { DynamicModule, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { getRepositoryToken } from '@nestjs/typeorm';
import { APP_GUARD } from '@nestjs/core';
import { Reflector } from '@nestjs/core';
import { UsersController } from '../src/users/users.controller';
import { UsersService } from '../src/users/users.service';
import { ProfileEntity } from '../src/users/profile.entity';
import { InternalGuard } from '../src/guards/internal.guard';
import { HEADERS, Role } from '@nest-gateway/shared';

const INTERNAL_SECRET = 'test-internal-secret-value';
const USER_ID = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';

describe('Users (e2e)', () => {
  let app: NestFastifyApplication;

  const now = new Date();

  const mockProfile: ProfileEntity = {
    id: USER_ID,
    email: 'user@example.com',
    name: 'Test User',
    avatarUrl: null,
    isActive: true,
    createdAt: now,
    updatedAt: now,
  };

  const mockRepo = {
    findOne: jest.fn(),
    save: jest.fn(),
    create: jest.fn(),
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        // Cast to any: @nestjs/config is hoisted to root with @nestjs/common@10 types,
        // but @nestjs/testing here resolves @nestjs/common@11 — compatible at runtime.
        ConfigModule.forRoot({
          isGlobal: true,
          load: [() => ({ INTERNAL_SECRET })],
        }) as unknown as DynamicModule,
      ],
      controllers: [UsersController],
      providers: [
        UsersService,
        Reflector,
        { provide: getRepositoryToken(ProfileEntity), useValue: mockRepo },
        { provide: APP_GUARD, useClass: InternalGuard },
      ],
    }).compile();

    app = moduleFixture.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterAll(() => app.close());

  beforeEach(() => jest.clearAllMocks());

  describe('GET /users/health', () => {
    it('returns 200 without internal secret (public endpoint)', async () => {
      const res = await app.inject({ method: 'GET', url: '/users/health' });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ status: 'ok', service: 'user-service' });
    });
  });

  describe('POST /users', () => {
    it('returns 401 without internal secret', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/users',
        payload: { id: USER_ID, email: 'user@example.com' },
      });

      expect(res.statusCode).toBe(401);
    });

    it('returns 400 for invalid UUID', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/users',
        headers: { [HEADERS.INTERNAL_SECRET]: INTERNAL_SECRET },
        payload: { id: 'not-a-uuid', email: 'user@example.com' },
      });

      expect(res.statusCode).toBe(400);
    });

    it('returns 400 for invalid email', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/users',
        headers: { [HEADERS.INTERNAL_SECRET]: INTERNAL_SECRET },
        payload: { id: USER_ID, email: 'not-an-email' },
      });

      expect(res.statusCode).toBe(400);
    });

    it('returns 201 and profile on success', async () => {
      mockRepo.create.mockReturnValue(mockProfile);
      mockRepo.save.mockResolvedValue(mockProfile);

      const res = await app.inject({
        method: 'POST',
        url: '/users',
        headers: { [HEADERS.INTERNAL_SECRET]: INTERNAL_SECRET },
        payload: { id: USER_ID, email: 'user@example.com' },
      });

      expect(res.statusCode).toBe(201);
      expect(res.json()).toMatchObject({ id: USER_ID, email: 'user@example.com' });
    });
  });

  describe('GET /users/:id', () => {
    it('returns 200 for own profile', async () => {
      mockRepo.findOne.mockResolvedValue(mockProfile);

      const res = await app.inject({
        method: 'GET',
        url: `/users/${USER_ID}`,
        headers: {
          [HEADERS.INTERNAL_SECRET]: INTERNAL_SECRET,
          [HEADERS.USER_ID]: USER_ID,
          [HEADERS.USER_ROLES]: Role.USER,
        },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({ id: USER_ID });
    });

    it('returns 200 for admin accessing another user', async () => {
      mockRepo.findOne.mockResolvedValue(mockProfile);

      const res = await app.inject({
        method: 'GET',
        url: `/users/${USER_ID}`,
        headers: {
          [HEADERS.INTERNAL_SECRET]: INTERNAL_SECRET,
          [HEADERS.USER_ID]: 'admin-uuid',
          [HEADERS.USER_ROLES]: Role.ADMIN,
        },
      });

      expect(res.statusCode).toBe(200);
    });

    it('returns 403 for non-admin accessing another user', async () => {
      mockRepo.findOne.mockResolvedValue(mockProfile);

      const res = await app.inject({
        method: 'GET',
        url: `/users/${USER_ID}`,
        headers: {
          [HEADERS.INTERNAL_SECRET]: INTERNAL_SECRET,
          [HEADERS.USER_ID]: 'other-uuid',
          [HEADERS.USER_ROLES]: Role.USER,
        },
      });

      expect(res.statusCode).toBe(403);
    });

    it('returns 404 when user does not exist', async () => {
      mockRepo.findOne.mockResolvedValue(null);

      const res = await app.inject({
        method: 'GET',
        url: '/users/missing-uuid',
        headers: {
          [HEADERS.INTERNAL_SECRET]: INTERNAL_SECRET,
          [HEADERS.USER_ID]: 'missing-uuid',
          [HEADERS.USER_ROLES]: Role.USER,
        },
      });

      expect(res.statusCode).toBe(404);
    });
  });

  describe('PATCH /users/:id', () => {
    it('returns 200 when owner updates their profile', async () => {
      const updated = { ...mockProfile, name: 'Updated Name' };
      mockRepo.findOne.mockResolvedValue(mockProfile);
      mockRepo.save.mockResolvedValue(updated);

      const res = await app.inject({
        method: 'PATCH',
        url: `/users/${USER_ID}`,
        headers: {
          [HEADERS.INTERNAL_SECRET]: INTERNAL_SECRET,
          [HEADERS.USER_ID]: USER_ID,
          [HEADERS.USER_ROLES]: Role.USER,
        },
        payload: { name: 'Updated Name' },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().name).toBe('Updated Name');
    });

    it('returns 400 for unknown fields', async () => {
      const res = await app.inject({
        method: 'PATCH',
        url: `/users/${USER_ID}`,
        headers: {
          [HEADERS.INTERNAL_SECRET]: INTERNAL_SECRET,
          [HEADERS.USER_ID]: USER_ID,
          [HEADERS.USER_ROLES]: Role.USER,
        },
        payload: { name: 'X', unknownField: 'y' },
      });

      expect(res.statusCode).toBe(400);
    });

    it('returns 403 when non-admin updates another user', async () => {
      mockRepo.findOne.mockResolvedValue(mockProfile);

      const res = await app.inject({
        method: 'PATCH',
        url: `/users/${USER_ID}`,
        headers: {
          [HEADERS.INTERNAL_SECRET]: INTERNAL_SECRET,
          [HEADERS.USER_ID]: 'other-uuid',
          [HEADERS.USER_ROLES]: Role.USER,
        },
        payload: { name: 'Hack' },
      });

      expect(res.statusCode).toBe(403);
    });
  });

  describe('DELETE /users/:id', () => {
    it('returns 200 when admin deletes a user', async () => {
      mockRepo.findOne.mockResolvedValue(mockProfile);
      mockRepo.save.mockResolvedValue({ ...mockProfile, isActive: false });

      const res = await app.inject({
        method: 'DELETE',
        url: `/users/${USER_ID}`,
        headers: {
          [HEADERS.INTERNAL_SECRET]: INTERNAL_SECRET,
          [HEADERS.USER_ROLES]: Role.ADMIN,
        },
      });

      expect(res.statusCode).toBe(200);
    });

    it('returns 403 when non-admin tries to delete', async () => {
      const res = await app.inject({
        method: 'DELETE',
        url: `/users/${USER_ID}`,
        headers: {
          [HEADERS.INTERNAL_SECRET]: INTERNAL_SECRET,
          [HEADERS.USER_ROLES]: Role.USER,
        },
      });

      expect(res.statusCode).toBe(403);
    });

    it('returns 404 when user does not exist', async () => {
      mockRepo.findOne.mockResolvedValue(null);

      const res = await app.inject({
        method: 'DELETE',
        url: '/users/missing-uuid',
        headers: {
          [HEADERS.INTERNAL_SECRET]: INTERNAL_SECRET,
          [HEADERS.USER_ROLES]: Role.ADMIN,
        },
      });

      expect(res.statusCode).toBe(404);
    });
  });
});
