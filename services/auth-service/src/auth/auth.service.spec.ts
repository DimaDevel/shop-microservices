import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';
import { AuthOutboxService } from './auth-outbox.service';
import { UserEntity } from '../users/user.entity';
import { Role } from '@nest-gateway/shared';
import {
  EmailAlreadyTakenError,
  InvalidCredentialsError,
  InvalidRefreshTokenError,
  RefreshTokenRevokedError,
} from './auth.errors';

jest.mock('bcrypt');

const makeUser = (overrides: Partial<UserEntity> = {}): UserEntity =>
  ({
    id: 'uuid-1',
    email: 'test@example.com',
    passwordHash: 'hashed',
    roles: [Role.USER],
    isActive: true,
    refreshToken: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }) as UserEntity;

describe('AuthService', () => {
  let service: AuthService;
  let usersRepo: Record<string, jest.Mock>;
  let jwtService: jest.Mocked<JwtService>;
  let configService: jest.Mocked<ConfigService>;
  let dataSource: jest.Mocked<DataSource>;
  let outboxService: jest.Mocked<AuthOutboxService>;

  const mockQb = {
    addSelect: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    getOne: jest.fn(),
  };

  // Simulate EntityManager passed to transaction callback
  const mockManager = {
    create: jest.fn(),
    save: jest.fn(),
  };

  beforeEach(async () => {
    usersRepo = {
      findOne: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
      update: jest.fn(),
      createQueryBuilder: jest.fn().mockReturnValue(mockQb),
    };

    dataSource = {
      transaction: jest.fn().mockImplementation(async (cb) => cb(mockManager)),
    } as unknown as jest.Mocked<DataSource>;

    outboxService = {
      write: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<AuthOutboxService>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: getRepositoryToken(UserEntity), useValue: usersRepo },
        { provide: JwtService, useValue: { signAsync: jest.fn(), verify: jest.fn() } },
        { provide: ConfigService, useValue: { getOrThrow: jest.fn(), get: jest.fn() } },
        { provide: DataSource, useValue: dataSource },
        { provide: AuthOutboxService, useValue: outboxService },
      ],
    }).compile();

    service = module.get(AuthService);
    jwtService = module.get(JwtService);
    configService = module.get(ConfigService);

    (configService.getOrThrow as jest.Mock).mockImplementation((key: string) => {
      const values: Record<string, unknown> = {
        JWT_REFRESH_SECRET: 'refresh-secret',
        JWT_ACCESS_EXPIRES_IN: 3600,
        JWT_REFRESH_EXPIRES_IN: 604800,
      };
      return values[key];
    });

    (jwtService.signAsync as jest.Mock).mockResolvedValue('signed-token');
    (bcrypt.hash as jest.Mock).mockResolvedValue('hashed-password');
    (bcrypt.compare as jest.Mock).mockResolvedValue(true);
  });

  afterEach(() => jest.clearAllMocks());

  describe('register', () => {
    it('hashes password, saves user via transaction, writes outbox, and returns tokens', async () => {
      const user = makeUser();
      mockManager.create.mockReturnValue(user);
      mockManager.save.mockResolvedValue(user);
      usersRepo.update.mockResolvedValue(undefined);

      const result = await service.register({ email: 'test@example.com', password: 'pass1234' });

      expect(bcrypt.hash).toHaveBeenCalledWith('pass1234', 12);
      expect(dataSource.transaction).toHaveBeenCalledTimes(1);
      expect(outboxService.write).toHaveBeenCalledTimes(1);
      expect(result).toMatchObject({
        accessToken: 'signed-token',
        refreshToken: 'signed-token',
        userId: 'uuid-1',
        email: 'test@example.com',
      });
    });

    it('throws EmailAlreadyTakenError on PG unique violation (23505)', async () => {
      const pgError = Object.assign(new Error('duplicate key'), { code: '23505' });
      (dataSource.transaction as jest.Mock).mockRejectedValue(pgError);

      await expect(service.register({ email: 'test@example.com', password: 'pass1234' })).rejects.toThrow(
        EmailAlreadyTakenError,
      );
    });

    it('rethrows non-duplicate errors from the transaction', async () => {
      (dataSource.transaction as jest.Mock).mockRejectedValue(new Error('db connection lost'));

      await expect(service.register({ email: 'test@example.com', password: 'pass1234' })).rejects.toThrow(
        'db connection lost',
      );
    });

    it('rethrows when JWT signing fails', async () => {
      const user = makeUser();
      mockManager.create.mockReturnValue(user);
      mockManager.save.mockResolvedValue(user);
      (jwtService.signAsync as jest.Mock).mockRejectedValue(new Error('jwt lib error'));

      await expect(service.register({ email: 'test@example.com', password: 'pass1234' })).rejects.toThrow(
        'jwt lib error',
      );
    });
  });

  describe('login', () => {
    it('returns tokens when credentials are valid', async () => {
      const user = makeUser();
      mockQb.getOne.mockResolvedValue(user);
      usersRepo.update.mockResolvedValue(undefined);

      const result = await service.login({ email: 'test@example.com', password: 'pass1234' });

      expect(bcrypt.compare).toHaveBeenCalledWith('pass1234', user.passwordHash);
      expect(result).toMatchObject({ accessToken: 'signed-token', email: 'test@example.com' });
    });

    it('throws InvalidCredentialsError when user not found', async () => {
      mockQb.getOne.mockResolvedValue(null);

      await expect(service.login({ email: 'no@one.com', password: 'pass1234' })).rejects.toThrow(
        InvalidCredentialsError,
      );
    });

    it('throws InvalidCredentialsError when password does not match', async () => {
      mockQb.getOne.mockResolvedValue(makeUser());
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      await expect(service.login({ email: 'test@example.com', password: 'wrongpass' })).rejects.toThrow(
        InvalidCredentialsError,
      );
    });
  });

  describe('refresh', () => {
    it('issues new tokens for a valid refresh token', async () => {
      (jwtService.verify as jest.Mock).mockReturnValue({
        sub: 'uuid-1',
        email: 'test@example.com',
        roles: [Role.USER],
      });
      usersRepo.findOne.mockResolvedValue(makeUser());
      usersRepo.update.mockResolvedValue(undefined);

      const result = await service.refresh('valid-refresh-token');

      expect(result).toMatchObject({ accessToken: 'signed-token' });
    });

    it('throws InvalidRefreshTokenError when JWT verify fails', async () => {
      (jwtService.verify as jest.Mock).mockImplementation(() => {
        throw new Error('jwt expired');
      });

      await expect(service.refresh('bad-token')).rejects.toThrow(InvalidRefreshTokenError);
    });

    it('throws RefreshTokenRevokedError when no matching user found', async () => {
      (jwtService.verify as jest.Mock).mockReturnValue({ sub: 'uuid-1' });
      usersRepo.findOne.mockResolvedValue(null);

      await expect(service.refresh('revoked-token')).rejects.toThrow(RefreshTokenRevokedError);
    });
  });

  describe('logout', () => {
    it('clears refreshToken and returns success message', async () => {
      usersRepo.update.mockResolvedValue(undefined);

      const result = await service.logout('uuid-1');

      expect(usersRepo.update).toHaveBeenCalledWith('uuid-1', { refreshToken: null });
      expect(result).toEqual({ message: 'Logged out successfully' });
    });
  });
});
