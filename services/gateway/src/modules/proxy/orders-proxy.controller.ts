import { Controller, Get, Post, Body, Param, Query, Req, Res } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiParam, ApiBody, ApiResponse } from '@nestjs/swagger';
import { FastifyRequest, FastifyReply } from 'fastify';
import { CurrentUser, RequestUser } from '@nest-gateway/shared';
import { ProxyService } from './proxy.service';
import { CreateOrderRequestDto, OrderDto } from '../../swagger/order.dto';
import { ApiErrorDto } from '../../swagger/common.dto';

@ApiTags('Orders')
@ApiBearerAuth()
@Controller('orders')
export class OrdersProxyController {
  constructor(private readonly proxyService: ProxyService) {}

  @Post()
  @ApiOperation({ summary: 'Place a new order', description: 'Triggers the order saga: reserves stock, processes payment, and confirms the order. Requires a valid Bearer token.' })
  @ApiBody({ type: CreateOrderRequestDto })
  @ApiResponse({ status: 201, description: 'Order created and saga initiated', type: OrderDto })
  @ApiResponse({ status: 400, description: 'Invalid order data', type: ApiErrorDto })
  @ApiResponse({ status: 401, description: 'Unauthorized', type: ApiErrorDto })
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
  @ApiOperation({ summary: 'List orders for the authenticated user' })
  @ApiResponse({ status: 200, description: 'Paginated orders', type: [OrderDto] })
  @ApiResponse({ status: 401, description: 'Unauthorized', type: ApiErrorDto })
  async findAll(
    @Query('page') page: string,
    @Query('limit') limit: string,
    @Req() req: FastifyRequest & { correlationId?: string },
    @Res() res: FastifyReply,
    @CurrentUser() user: RequestUser,
  ) {
    const qs = new URLSearchParams();
    if (page) qs.set('page', page);
    if (limit) qs.set('limit', limit);
    const query = qs.toString();
    const { status, data } = await this.proxyService.proxyToOrders({
      method: 'GET',
      path: query ? `/orders?${query}` : '/orders',
      user,
      correlationId: req.correlationId,
    });
    return res.status(status).send(data);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get an order by ID' })
  @ApiParam({ name: 'id', description: 'Order UUID' })
  @ApiResponse({ status: 200, description: 'Order details', type: OrderDto })
  @ApiResponse({ status: 404, description: 'Order not found', type: ApiErrorDto })
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
