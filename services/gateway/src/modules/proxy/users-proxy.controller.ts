import {
  Controller,
  Get,
  Patch,
  Delete,
  Param,
  Body,
  Req,
  Res,
} from '@nestjs/common';
import { FastifyRequest, FastifyReply } from 'fastify';
import { CurrentUser, Roles, Role, RequestUser } from '@nest-gateway/shared';
import { ProxyService } from './proxy.service';

// ─────────────────────────────────────────────────────────────
//  UsersProxyController
//
//  Защищённые маршруты — JwtAuthGuard применяется глобально.
//  Демонстрирует использование:
//    @CurrentUser() — получить данные юзера из req.user
//    @Roles()       — ограничить доступ по роли
// ─────────────────────────────────────────────────────────────
@Controller('users')
export class UsersProxyController {
  constructor(private readonly proxy: ProxyService) {}

  // Любой аутентифицированный пользователь
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

  // Только владелец аккаунта или admin
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

  // Только ADMIN — пример @Roles() декоратора
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
