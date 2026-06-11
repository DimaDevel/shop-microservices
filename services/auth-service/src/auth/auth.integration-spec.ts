import { Test, TestingModule } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { PostgreSqlContainer, StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { AuthService } from './auth.service';
import { AuthOutboxService } from './auth-outbox.service';
import { UserEntity } from '../users/user.entity';
import { AuthOutboxEntity } from './auth-outbox.entity';
import {
  EmailAlreadyTakenError,
  InvalidCredentialsError,
  InvalidRefreshTokenError,
  RefreshTokenRevokedError,
} from './auth.errors';

describe('AuthService (integration)', () => {
  let container: StartedPostgreSqlContainer;
  let module: TestingModule;
  let service: AuthService;
  let dataSource: DataSource;

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:16-alpine').start();

    module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        TypeOrmModule.forRoot({
          type: 'postgres',
          host: container.getHost(),
          port: container.getFirstMappedPort(),
          username: container.getUsername(),
          password: container.getPassword(),
          database: container.getDatabase(),
          entities: [UserEntity, AuthOutboxEntity],
          // Creates schema automatically — fine for tests
          synchronize: true,
        }),
        TypeOrmModule.forFeature([UserEntity, AuthOutboxEntity]),
        JwtModule.register({ secret: 'integration-test-secret', signOptions: { expiresIn: '1h' } }),
      ],
      providers: [
        AuthService,
        AuthOutboxService,
        {
          provide: ConfigService,
          useValue: {
            getOrThrow: (key: string) => {
              const map: Record<string, unknown> = {
                JWT_REFRESH_SECRET: 'integration-refresh-secret',
                JWT_ACCESS_EXPIRES_IN: 3600,
                JWT_REFRESH_EXPIRES_IN: 604800,
              };
              if (!(key in map)) throw new Error(`Missing config: ${key}`);
              return map[key];
            },
            get: (key: string, fallback?: unknown) => {
              const map: Record<string, unknown> = {
                JWT_ACCESS_EXPIRES_IN: 3600,
                JWT_REFRESH_EXPIRES_IN: 604800,
              };
              return map[key] ?? fallback;
            },
          },
        },
      ],
    }).compile();

    service = module.get(AuthService);
    dataSource = module.get(DataSource);
  }, 120_000);

  afterAll(async () => {
    await module?.close();
    await container?.stop();
  });

  afterEach(async () => {
    await dataSource?.query('TRUNCATE users, auth_outbox RESTART IDENTITY CASCADE');
  });

  describe('register', () => {
    it('creates a user row and outbox entry, returns tokens', async () => {
      const result = await service.register({ email: 'alice@example.com', password: 'pass1234' });

      expect(result.accessToken).toBeTruthy();
      expect(result.refreshToken).toBeTruthy();
      expect(result.email).toBe('alice@example.com');

      const [user] = await dataSource.query(`SELECT email, roles FROM users WHERE email = 'alice@example.com'`);
      expect(user.email).toBe('alice@example.com');
      expect(user.roles).toContain('user');

      const [outbox] = await dataSource.query(`SELECT topic FROM auth_outbox`);
      expect(outbox.topic).toBeTruthy();
    });

    it('throws EmailAlreadyTakenError on duplicate email', async () => {
      await service.register({ email: 'bob@example.com', password: 'pass1234' });

      await expect(service.register({ email: 'bob@example.com', password: 'different1' })).rejects.toThrow(
        EmailAlreadyTakenError,
      );
    });

    it('stores a bcrypt hash, not the plain password', async () => {
      await service.register({ email: 'carol@example.com', password: 'mySecret1' });

      const [user] = await dataSource.query(`SELECT "passwordHash" FROM users WHERE email = 'carol@example.com'`);
      expect(user.passwordHash).not.toBe('mySecret1');
      expect(user.passwordHash).toMatch(/^\$2[aby]\$/);
    });
  });

  describe('login', () => {
    beforeEach(async () => {
      await service.register({ email: 'dave@example.com', password: 'pass1234' });
    });

    it('returns tokens for valid credentials', async () => {
      const result = await service.login({ email: 'dave@example.com', password: 'pass1234' });

      expect(result.accessToken).toBeTruthy();
      expect(result.email).toBe('dave@example.com');
    });

    it('throws InvalidCredentialsError for wrong password', async () => {
      await expect(service.login({ email: 'dave@example.com', password: 'wrongPass1' })).rejects.toThrow(
        InvalidCredentialsError,
      );
    });

    it('throws InvalidCredentialsError for unknown email', async () => {
      await expect(service.login({ email: 'ghost@example.com', password: 'pass1234' })).rejects.toThrow(
        InvalidCredentialsError,
      );
    });
  });

  describe('refresh', () => {
    it('issues new tokens and rotates the refresh token in DB', async () => {
      const { userId, refreshToken } = await service.register({
        email: 'eve@example.com',
        password: 'pass1234',
      });

      const result = await service.refresh(refreshToken);

      expect(result.accessToken).toBeTruthy();
      expect(result.refreshToken).not.toBe(refreshToken);

      const [user] = await dataSource.query(`SELECT "refreshToken" FROM users WHERE id = '${userId}'`);
      expect(user.refreshToken).not.toBe(refreshToken);
    });

    it('throws InvalidRefreshTokenError for a garbage token', async () => {
      await expect(service.refresh('not.a.jwt')).rejects.toThrow(InvalidRefreshTokenError);
    });

    it('throws RefreshTokenRevokedError after logout invalidates the token', async () => {
      const { userId, refreshToken } = await service.register({
        email: 'frank@example.com',
        password: 'pass1234',
      });
      await service.logout(userId);

      await expect(service.refresh(refreshToken)).rejects.toThrow(RefreshTokenRevokedError);
    });
  });

  describe('logout', () => {
    it('sets refreshToken to null in DB', async () => {
      const { userId } = await service.register({ email: 'grace@example.com', password: 'pass1234' });

      await service.logout(userId);

      const [user] = await dataSource.query(`SELECT "refreshToken" FROM users WHERE id = '${userId}'`);
      expect(user.refreshToken).toBeNull();
    });

    it('returns a success message', async () => {
      const { userId } = await service.register({ email: 'harry@example.com', password: 'pass1234' });

      const result = await service.logout(userId);

      expect(result.message).toMatch(/logged out/i);
    });
  });
});
