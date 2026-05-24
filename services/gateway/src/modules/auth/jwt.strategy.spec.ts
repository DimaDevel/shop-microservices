import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { JwtStrategy } from './jwt.strategy';
import { JwtPayload, Role } from '@nest-gateway/shared';

const makePayload = (overrides: Partial<JwtPayload> = {}): JwtPayload => ({
  sub: 'user-1',
  email: 'test@example.com',
  roles: [Role.USER],
  iat: 1000,
  exp: Math.floor(Date.now() / 1000) + 3600,
  ...overrides,
});

describe('JwtStrategy', () => {
  let strategy: JwtStrategy;
  let mockCache: Record<string, jest.Mock>;

  beforeEach(async () => {
    mockCache = { get: jest.fn(), set: jest.fn(), del: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        JwtStrategy,
        {
          provide: ConfigService,
          useValue: { getOrThrow: jest.fn().mockReturnValue('secret-at-least-32-characters-long') },
        },
        { provide: CACHE_MANAGER, useValue: mockCache },
      ],
    }).compile();

    strategy = module.get(JwtStrategy);
  });

  afterEach(() => jest.clearAllMocks());

  it('returns cached user directly and skips cache.set on hit', async () => {
    const payload = makePayload();
    const cachedUser = { id: payload.sub, email: payload.email, roles: payload.roles };
    mockCache.get.mockResolvedValue(cachedUser);

    const result = await strategy.validate(payload);

    expect(result).toBe(cachedUser);
    expect(mockCache.set).not.toHaveBeenCalled();
  });

  it('builds user from payload and stores it in cache on miss', async () => {
    const payload = makePayload();
    mockCache.get.mockResolvedValue(null);
    mockCache.set.mockResolvedValue(undefined);

    const result = await strategy.validate(payload);

    expect(result).toEqual({ id: payload.sub, email: payload.email, roles: payload.roles });
    expect(mockCache.set).toHaveBeenCalledWith(
      `jwt:${payload.sub}:${payload.iat}`,
      result,
      expect.any(Number),
    );
    const ttlArg: number = mockCache.set.mock.calls[0][2];
    expect(ttlArg).toBeGreaterThan(0);
  });

  it('falls through and returns user when cache.get throws (Redis down)', async () => {
    mockCache.get.mockRejectedValue(new Error('Connection refused'));
    mockCache.set.mockResolvedValue(undefined);

    const result = await strategy.validate(makePayload());

    expect(result).toMatchObject({ id: 'user-1', email: 'test@example.com' });
  });

  it('does not rethrow when cache.set throws (Redis down)', async () => {
    mockCache.get.mockResolvedValue(null);
    mockCache.set.mockRejectedValue(new Error('Connection refused'));

    await expect(strategy.validate(makePayload())).resolves.toMatchObject({ id: 'user-1' });
  });

  it('does not call cache.set when the token is already expired', async () => {
    mockCache.get.mockResolvedValue(null);
    const expiredPayload = makePayload({ exp: Math.floor(Date.now() / 1000) - 60 });

    await strategy.validate(expiredPayload);

    expect(mockCache.set).not.toHaveBeenCalled();
  });
});
