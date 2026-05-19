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
import { OrdersService } from './orders.service';
import { CreateOrderDto } from './orders.dto';
import { HEADERS } from '@nest-gateway/shared';
import { OrderNotFoundError } from './orders.errors';

@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post()
  @HttpCode(202)
  async create(
    @Body() dto: CreateOrderDto,
    @Headers(HEADERS.USER_ID) userId: string,
    @Headers(HEADERS.USER_EMAIL) userEmail: string,
    @Headers(HEADERS.CORRELATION_ID) correlationId: string,
  ) {
    if (!userId) throw new UnauthorizedException('Missing user id');

    return this.ordersService.create({
      userId,
      userEmail,
      correlationId: correlationId ?? '',
      items: dto.items,
    });
  }

  @Get()
  findAll(@Headers(HEADERS.USER_ID) userId: string) {
    if (!userId) throw new UnauthorizedException('Missing user id');
    return this.ordersService.findByUser(userId);
  }

  @Get(':id')
  async findById(
    @Param('id', ParseUUIDPipe) id: string,
    @Headers(HEADERS.USER_ID) userId: string,
  ) {
    if (!userId) throw new UnauthorizedException('Missing user id');

    try {
      return await this.ordersService.findById(id, userId);
    } catch (e) {
      if (e instanceof OrderNotFoundError) throw new NotFoundException(e.message);
      throw e;
    }
  }
}
