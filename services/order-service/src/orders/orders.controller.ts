import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  ParseUUIDPipe,
  Headers,
  HttpCode,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { CreateOrderDto } from './orders.dto';
import { HEADERS } from '@nest-gateway/shared';
import { CreateOrderUseCase } from './application/use-cases/create-order.use-case';
import { GetOrderUseCase } from './application/use-cases/get-order.use-case';
import { GetUserOrdersUseCase } from './application/use-cases/get-user-orders.use-case';
import { OrderNotFoundError } from './domain/errors/orders.errors';

@Controller('orders')
export class OrdersController {
  constructor(
    private readonly createOrderUseCase: CreateOrderUseCase,
    private readonly getOrderUseCase: GetOrderUseCase,
    private readonly getUserOrdersUseCase: GetUserOrdersUseCase,
  ) {}

  @Post()
  @HttpCode(202)
  async create(
    @Body() dto: CreateOrderDto,
    @Headers(HEADERS.USER_ID) userId: string,
    @Headers(HEADERS.USER_EMAIL) userEmail: string,
    @Headers(HEADERS.CORRELATION_ID) correlationId: string,
  ) {
    if (!userId) throw new UnauthorizedException('Missing user id');
    return this.createOrderUseCase.execute({ userId, userEmail, correlationId: correlationId ?? '', items: dto.items });
  }

  @Get()
  findAll(@Headers(HEADERS.USER_ID) userId: string) {
    if (!userId) throw new UnauthorizedException('Missing user id');
    return this.getUserOrdersUseCase.execute(userId);
  }

  @Get(':id')
  async findById(@Param('id', ParseUUIDPipe) id: string, @Headers(HEADERS.USER_ID) userId: string) {
    if (!userId) throw new UnauthorizedException('Missing user id');
    try {
      return await this.getOrderUseCase.execute(id, userId);
    } catch (e) {
      if (e instanceof OrderNotFoundError) throw new NotFoundException(e.message);
      throw e;
    }
  }
}
