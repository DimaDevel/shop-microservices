import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Req,
  Res,
  HttpCode,
} from '@nestjs/common';
import { FastifyRequest, FastifyReply } from 'fastify';
import { CurrentUser, RequestUser, Roles } from '@nest-gateway/shared';
import { Role } from '@nest-gateway/shared';
import { ProxyService } from './proxy.service';

@Controller('products')
export class ProductsProxyController {
  constructor(private readonly proxyService: ProxyService) {}

  @Get()
  async findAll(
    @Req() req: FastifyRequest & { correlationId?: string },
    @Res() res: FastifyReply,
    @CurrentUser() user: RequestUser,
  ) {
    const { status, data } = await this.proxyService.proxyToProducts({
      method: 'GET',
      path: '/products',
      user,
      correlationId: req.correlationId,
    });
    return res.status(status).send(data);
  }

  @Get(':id')
  async findById(
    @Param('id') id: string,
    @Req() req: FastifyRequest & { correlationId?: string },
    @Res() res: FastifyReply,
    @CurrentUser() user: RequestUser,
  ) {
    const { status, data } = await this.proxyService.proxyToProducts({
      method: 'GET',
      path: `/products/${id}`,
      user,
      correlationId: req.correlationId,
    });
    return res.status(status).send(data);
  }

  @Post()
  @Roles(Role.ADMIN)
  async create(
    @Body() body: unknown,
    @Req() req: FastifyRequest & { correlationId?: string },
    @Res() res: FastifyReply,
    @CurrentUser() user: RequestUser,
  ) {
    const { status, data } = await this.proxyService.proxyToProducts({
      method: 'POST',
      path: '/products',
      body,
      user,
      correlationId: req.correlationId,
    });
    return res.status(status).send(data);
  }

  @Patch(':id')
  @Roles(Role.ADMIN)
  async update(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() req: FastifyRequest & { correlationId?: string },
    @Res() res: FastifyReply,
    @CurrentUser() user: RequestUser,
  ) {
    const { status, data } = await this.proxyService.proxyToProducts({
      method: 'PATCH',
      path: `/products/${id}`,
      body,
      user,
      correlationId: req.correlationId,
    });
    return res.status(status).send(data);
  }

  @Delete(':id')
  @HttpCode(204)
  @Roles(Role.ADMIN)
  async remove(
    @Param('id') id: string,
    @Req() req: FastifyRequest & { correlationId?: string },
    @Res() res: FastifyReply,
    @CurrentUser() user: RequestUser,
  ) {
    const { status, data } = await this.proxyService.proxyToProducts({
      method: 'DELETE',
      path: `/products/${id}`,
      user,
      correlationId: req.correlationId,
    });
    return res.status(status).send(data);
  }
}
