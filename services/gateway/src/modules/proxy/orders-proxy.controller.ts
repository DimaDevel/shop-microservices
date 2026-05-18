import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Req,
  Res,
} from '@nestjs/common';
import { FastifyRequest, FastifyReply } from 'fastify';
import { CurrentUser, RequestUser } from '@nest-gateway/shared';
import { ProxyService } from './proxy.service';

@Controller('orders')
export class OrdersProxyController {
  constructor(private readonly proxyService: ProxyService) {}

  @Post()
  async create(
    @Body() body: unknown,
    @Req() req: FastifyRequest & { correlationId?: string },
    @Res() res: FastifyReply,
    @CurrentUser() user: RequestUser,
  ) {
    const { status, data } = await this.proxyService.proxyToOrders({
      method: 'POST',
      path: '/orders',
      body,
      user,
      correlationId: req.correlationId,
    });
    return res.status(status).send(data);
  }

  @Get()
  async findAll(
    @Req() req: FastifyRequest & { correlationId?: string },
    @Res() res: FastifyReply,
    @CurrentUser() user: RequestUser,
  ) {
    const { status, data } = await this.proxyService.proxyToOrders({
      method: 'GET',
      path: '/orders',
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
    const { status, data } = await this.proxyService.proxyToOrders({
      method: 'GET',
      path: `/orders/${id}`,
      user,
      correlationId: req.correlationId,
    });
    return res.status(status).send(data);
  }
}
