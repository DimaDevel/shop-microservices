import { Controller, Post, Body, Req, Res, HttpCode } from '@nestjs/common';
import { FastifyRequest, FastifyReply } from 'fastify';
import { Public, CurrentUser, RequestUser } from '@nest-gateway/shared';
import { ProxyService } from './proxy.service';

@Controller('auth')
export class AuthProxyController {
  constructor(private readonly proxyService: ProxyService) {}

  @Public()
  @Post('login')
  @HttpCode(200)
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
  async logout(
    @CurrentUser() user: RequestUser,
    @Req() req: FastifyRequest & { correlationId?: string },
    @Res() res: FastifyReply,
  ) {
    const { status, data } = await this.proxyService.proxyToAuth({
      method: 'POST',
      path: '/auth/logout',
      user,
      correlationId: req.correlationId,
    });

    return res.status(status).send(data);
  }
}
