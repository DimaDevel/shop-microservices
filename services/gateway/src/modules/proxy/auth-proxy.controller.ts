import { Controller, Post, Body, Req, Res, HttpCode, Inject } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBody, ApiResponse } from '@nestjs/swagger';
import { FastifyRequest, FastifyReply } from 'fastify';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { JwtService } from '@nestjs/jwt';
import { Public, CurrentUser, RequestUser, JwtPayload } from '@nest-gateway/shared';
import { ProxyService } from './proxy.service';
import { LoginRequestDto, RegisterRequestDto, RefreshTokenRequestDto, AuthResponseDto, AuthTokensDto } from '../../swagger/auth.dto';
import { ApiErrorDto, MessageDto } from '../../swagger/common.dto';

@ApiTags('Auth')
@Controller('auth')
export class AuthProxyController {
  constructor(
    private readonly proxyService: ProxyService,
    private readonly jwtService: JwtService,
    @Inject(CACHE_MANAGER) private readonly cache: Cache,
  ) {}

  @Public()
  @Post('login')
  @HttpCode(200)
  @ApiOperation({ summary: 'Log in with email and password', description: 'Returns access and refresh JWT tokens on success.' })
  @ApiBody({ type: LoginRequestDto })
  @ApiResponse({ status: 200, description: 'Login successful', type: AuthResponseDto })
  @ApiResponse({ status: 401, description: 'Invalid credentials', type: ApiErrorDto })
  async login(
    @Body() body: unknown,
    @Req() req: FastifyRequest & { correlationId?: string },
    @Res() res: FastifyReply,
  ) {
    const { status, data } = await this.proxyService.proxyToAuth({
      method: 'POST',
      path: '/auth/login',
      body,
      correlationId: req.correlationId,
    });

    return res.status(status).send(data);
  }

  @Public()
  @Post('register')
  @HttpCode(201)
  @ApiOperation({ summary: 'Register a new user account' })
  @ApiBody({ type: RegisterRequestDto })
  @ApiResponse({ status: 201, description: 'Account created', type: AuthResponseDto })
  @ApiResponse({ status: 409, description: 'Email already in use', type: ApiErrorDto })
  async register(
    @Body() body: unknown,
    @Req() req: FastifyRequest & { correlationId?: string },
    @Res() res: FastifyReply,
  ) {
    const { status, data } = await this.proxyService.proxyToAuth({
      method: 'POST',
      path: '/auth/register',
      body,
      correlationId: req.correlationId,
    });

    return res.status(status).send(data);
  }

  @Public()
  @Post('refresh')
  @HttpCode(200)
  @ApiOperation({ summary: 'Refresh access token', description: 'Exchange a valid refresh token for a new token pair. The old refresh token is invalidated.' })
  @ApiBody({ type: RefreshTokenRequestDto })
  @ApiResponse({ status: 200, description: 'Tokens refreshed', type: AuthTokensDto })
  @ApiResponse({ status: 401, description: 'Refresh token invalid or expired', type: ApiErrorDto })
  async refresh(
    @Body() body: unknown,
    @Req() req: FastifyRequest & { correlationId?: string },
    @Res() res: FastifyReply,
  ) {
    const { status, data } = await this.proxyService.proxyToAuth({
      method: 'POST',
      path: '/auth/refresh',
      body,
      correlationId: req.correlationId,
    });

    return res.status(status).send(data);
  }

  @Post('logout')
  @HttpCode(200)
  @ApiOperation({ summary: 'Log out the current user', description: 'Invalidates the stored refresh token. Requires a valid Bearer token.' })
  @ApiResponse({ status: 200, description: 'Logged out', type: MessageDto })
  @ApiResponse({ status: 401, description: 'Unauthorized', type: ApiErrorDto })
  async logout(
    @CurrentUser() user: RequestUser,
    @Req() req: FastifyRequest & { correlationId?: string; headers: { authorization?: string } },
    @Res() res: FastifyReply,
  ) {
    const { status, data } = await this.proxyService.proxyToAuth({
      method: 'POST',
      path: '/auth/logout',
      user,
      correlationId: req.correlationId,
    });

    const token = req.headers.authorization?.replace('Bearer ', '');
    if (token) {
      const payload = this.jwtService.decode<JwtPayload>(token);
      if (payload?.iat) {
        await this.cache.del(`jwt:${payload.sub}:${payload.iat}`).catch(() => undefined);
      }
    }

    return res.status(status).send(data);
  }
}
