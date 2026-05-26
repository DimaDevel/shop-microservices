import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { InternalGuard } from './internal.guard';
import { HEADERS } from '@nest-gateway/shared';

const EXPECTED_SECRET = 'my-internal-secret';

function makeContext(headers: Record<string, string>): ExecutionContext {
  return {
    getHandler: jest.fn(),
    getClass: jest.fn(),
    switchToHttp: () => ({ getRequest: () => ({ headers }) }),
  } as unknown as ExecutionContext;
}

describe('InternalGuard', () => {
  let guard: InternalGuard;
  let reflector: jest.Mocked<Reflector>;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        InternalGuard,
        { provide: Reflector, useValue: { getAllAndOverride: jest.fn() } },
        { provide: ConfigService, useValue: { getOrThrow: jest.fn().mockReturnValue(EXPECTED_SECRET) } },
      ],
    }).compile();

    guard = module.get(InternalGuard);
    reflector = module.get(Reflector);
  });

  it('allows public routes without checking the secret', () => {
    reflector.getAllAndOverride.mockReturnValue(true);

    expect(guard.canActivate(makeContext({}))).toBe(true);
  });

  it('throws UnauthorizedException when header is missing', () => {
    reflector.getAllAndOverride.mockReturnValue(false);

    expect(() => guard.canActivate(makeContext({}))).toThrow(UnauthorizedException);
  });

  it('throws UnauthorizedException when header value is incorrect', () => {
    reflector.getAllAndOverride.mockReturnValue(false);

    expect(() => guard.canActivate(makeContext({ [HEADERS.INTERNAL_SECRET]: 'wrong-secret' }))).toThrow(
      UnauthorizedException,
    );
  });

  it('returns true when secret matches', () => {
    reflector.getAllAndOverride.mockReturnValue(false);

    expect(guard.canActivate(makeContext({ [HEADERS.INTERNAL_SECRET]: EXPECTED_SECRET }))).toBe(true);
  });
});
