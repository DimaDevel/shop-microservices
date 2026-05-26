import { Controller, Get, Patch, Delete, Param, Body, Req, Res } from '@nestjs/common';
import { FastifyRequest, FastifyReply } from 'fastify';
import { CurrentUser, Roles, Role, RequestUser } from '@nest-gateway/shared';
import { ProxyService } from './proxy.service';

// ─────────────────────────────────────────────────────────────
//  UsersProxyController
//
//  Protected routes — JwtAuthGuard is applied globally.
//  Demonstrates usage of:
//    @CurrentUser() — retrieve user data from req.user
//    @Roles()       — restrict access by role
// ─────────────────────────────────────────────────────────────
@Controller('users')
export class UsersProxyController {
  constructor(private readonly proxy: ProxyService) {}

  // Any authenticated user
  @Get(':id')
  async getUser(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
    @Req() req: FastifyRequest & { correlationId?: string },
    @Res() res: FastifyReply,
  ) {
    const { status, data } = await this.proxy.proxyToUsers({
      method: 'GET',
      path: `/users/${id}`,
      user,
      correlationId: req.correlationId,
    });

    return res.status(status).send(data);
  }

  // Account owner or admin only
  @Patch(':id')
  async updateUser(
    @Param('id') id: string,
    @Body() body: unknown,
    @CurrentUser() user: RequestUser,
    @Req() req: FastifyRequest & { correlationId?: string },
    @Res() res: FastifyReply,
  ) {
    const { status, data } = await this.proxy.proxyToUsers({
      method: 'PATCH',
      path: `/users/${id}`,
      body,
      user,
      correlationId: req.correlationId,
    });

    return res.status(status).send(data);
  }

  // ADMIN only — example of @Roles() decorator
  @Delete(':id')
  @Roles(Role.ADMIN)
  async deleteUser(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
    @Req() req: FastifyRequest & { correlationId?: string },
    @Res() res: FastifyReply,
  ) {
    const { status, data } = await this.proxy.proxyToUsers({
      method: 'DELETE',
      path: `/users/${id}`,
      user,
      correlationId: req.correlationId,
    });

    return res.status(status).send(data);
  }
}
