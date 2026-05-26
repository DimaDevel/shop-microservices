import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ConflictException, UnauthorizedException } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { LoginDto, RefreshTokenDto, RegisterDto } from './auth.dto';
import { TokensResult } from './auth.outputs';
import {
  EmailAlreadyTakenError,
  InvalidCredentialsError,
  InvalidRefreshTokenError,
  RefreshTokenRevokedError,
} from './auth.errors';

const mockTokens: TokensResult = {
  accessToken: 'access-token',
  refreshToken: 'refresh-token',
  expiresIn: 3600,
  userId: 'uuid-1',
  email: 'test@example.com',
};

describe('AuthController', () => {
  let controller: AuthController;
  let authService: jest.Mocked<AuthService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        {
          provide: AuthService,
          useValue: {
            register: jest.fn(),
            login: jest.fn(),
            refresh: jest.fn(),
            logout: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get(AuthController);
    authService = module.get(AuthService);
  });

  describe('register', () => {
    it('returns tokens on success', async () => {
      authService.register.mockResolvedValue(mockTokens);

      const result = await controller.register({ email: 'test@example.com', password: 'pass1234' } as RegisterDto);

      expect(authService.register).toHaveBeenCalledWith({ email: 'test@example.com', password: 'pass1234' });
      expect(result).toBe(mockTokens);
    });

    it('maps EmailAlreadyTakenError to ConflictException', async () => {
      authService.register.mockRejectedValue(new EmailAlreadyTakenError());

      await expect(
        controller.register({ email: 'test@example.com', password: 'pass1234' } as RegisterDto),
      ).rejects.toThrow(ConflictException);
    });

    it('re-throws unknown errors', async () => {
      const err = new Error('database down');
      authService.register.mockRejectedValue(err);

      await expect(
        controller.register({ email: 'test@example.com', password: 'pass1234' } as RegisterDto),
      ).rejects.toBe(err);
    });
  });

  describe('login', () => {
    it('returns tokens on success', async () => {
      authService.login.mockResolvedValue(mockTokens);

      const result = await controller.login({ email: 'test@example.com', password: 'pass1234' } as LoginDto);

      expect(result).toBe(mockTokens);
    });

    it('maps InvalidCredentialsError to UnauthorizedException', async () => {
      authService.login.mockRejectedValue(new InvalidCredentialsError());

      await expect(controller.login({ email: 'test@example.com', password: 'pass1234' } as LoginDto)).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  describe('refresh', () => {
    it('returns tokens on success', async () => {
      authService.refresh.mockResolvedValue(mockTokens);

      const result = await controller.refresh({ refreshToken: 'token' } as RefreshTokenDto);

      expect(result).toBe(mockTokens);
    });

    it('maps InvalidRefreshTokenError to UnauthorizedException', async () => {
      authService.refresh.mockRejectedValue(new InvalidRefreshTokenError());

      await expect(controller.refresh({ refreshToken: 'bad' } as RefreshTokenDto)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('maps RefreshTokenRevokedError to UnauthorizedException', async () => {
      authService.refresh.mockRejectedValue(new RefreshTokenRevokedError());

      await expect(controller.refresh({ refreshToken: 'revoked' } as RefreshTokenDto)).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  describe('logout', () => {
    it('returns success message', async () => {
      authService.logout.mockResolvedValue({ message: 'Logged out successfully' });

      const result = await controller.logout('uuid-1');

      expect(authService.logout).toHaveBeenCalledWith('uuid-1');
      expect(result).toEqual({ message: 'Logged out successfully' });
    });

    it('throws BadRequestException when userId header is missing', () => {
      expect(() => controller.logout(undefined as unknown as string)).toThrow(BadRequestException);
    });
  });

  describe('health', () => {
    it('returns ok status', () => {
      expect(controller.health()).toEqual({ status: 'ok', service: 'auth-service' });
    });
  });
});
