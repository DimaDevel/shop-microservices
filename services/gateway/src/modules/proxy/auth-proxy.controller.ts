import { Controller, Post, Body, Req, Res, HttpCode, Logger } from '@nestjs/common';
import { FastifyRequest, FastifyReply } from 'fastify';
import { Public, CurrentUser, RequestUser } from '@nest-gateway/shared';
import { ProxyService } from './proxy.service';

@Controller('auth')
export class AuthProxyController {
  private readonly logger = new Logger(AuthProxyController.name);

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

    if (status === 201) {
      const { userId, email } = data as { userId: string; email: string };
      try {
        await this.proxyService.proxyToUsers({
          method: 'POST',
          path: '/users',
          body: { id: userId, email },
          correlationId: req.correlationId,
        });
      } catch (err) {
        this.logger.error(`Failed to create profile for user ${userId}: ${(err as Error).message}`);
      }
    }

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
