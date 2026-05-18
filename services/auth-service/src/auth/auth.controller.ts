import {
  Controller,
  Post,
  Get,
  Body,
  HttpCode,
  Headers,
  ConflictException,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { LoginDto, RegisterDto, RefreshTokenDto } from './auth.dto';
import { HEADERS, Public } from '@nest-gateway/shared';
import {
  EmailAlreadyTakenError,
  InvalidCredentialsError,
  InvalidRefreshTokenError,
  RefreshTokenRevokedError,
} from './auth.errors';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  async register(@Body() dto: RegisterDto) {
    try {
      return await this.authService.register({ email: dto.email, password: dto.password });
    } catch (e) {
      if (e instanceof EmailAlreadyTakenError) throw new ConflictException(e.message);
      throw e;
    }
  }

  @Post('login')
  @HttpCode(200)
  async login(@Body() dto: LoginDto) {
    try {
      return await this.authService.login({ email: dto.email, password: dto.password });
    } catch (e) {
      if (e instanceof InvalidCredentialsError) throw new UnauthorizedException(e.message);
      throw e;
    }
  }

  @Post('refresh')
  @HttpCode(200)
  async refresh(@Body() dto: RefreshTokenDto) {
    try {
      return await this.authService.refresh(dto.refreshToken);
    } catch (e) {
      if (e instanceof InvalidRefreshTokenError || e instanceof RefreshTokenRevokedError) {
        throw new UnauthorizedException(e.message);
      }
      throw e;
    }
  }

  @Post('logout')
  @HttpCode(200)
  logout(@Headers(HEADERS.USER_ID) userId: string) {
    if (!userId) throw new BadRequestException('Missing user id');
    return this.authService.logout(userId);
  }

  @Public()
  @Get('health')
  health() {
    return { status: 'ok', service: 'auth-service' };
  }
}
