import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ClientKafka } from '@nestjs/microservices';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { OrderEntity } from './order.entity';
import { OrderItemEntity } from './order-item.entity';
import { CreateOrderInput } from './orders.inputs';
import { OrderResult } from './orders.outputs';
import { OrderNotFoundError, ProductServiceError } from './orders.errors';
import { KAFKA_TOPICS, HEADERS, OrderCreatedEvent } from '@nest-gateway/shared';

@Injectable()
export class OrdersService implements OnModuleInit {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    @InjectRepository(OrderEntity)
    private readonly ordersRepo: Repository<OrderEntity>,
    @Inject('KAFKA_CLIENT')
    private readonly kafkaClient: ClientKafka,
    private readonly config: ConfigService,
  ) {}

  async onModuleInit() {
    await this.kafkaClient.connect();
  }

  async create(input: CreateOrderInput): Promise<OrderResult> {
    const productServiceUrl = this.config.getOrThrow<string>('PRODUCT_SERVICE_URL');
    const internalSecret = this.config.getOrThrow<string>('INTERNAL_SECRET');

    const reserveResponse = await fetch(`${productServiceUrl}/products/reserve`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        [HEADERS.INTERNAL_SECRET]: internalSecret,
      },
      body: JSON.stringify({ items: input.items }),
    });

    if (!reserveResponse.ok) {
      const error = await reserveResponse.json() as { message?: string };
      throw new ProductServiceError(error.message ?? 'Failed to reserve products');
    }

    const { items: reservedItems } = await reserveResponse.json() as {
      items: Array<{ productId: string; name: string; unitPrice: number; quantity: number }>;
    };

    const total = reservedItems.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);

    const order = this.ordersRepo.create({
      userId: input.userId,
      userEmail: input.userEmail,
      total,
      items: reservedItems.map((item) => {
        const orderItem = new OrderItemEntity();
        orderItem.productId = item.productId;
        orderItem.productName = item.name;
        orderItem.quantity = item.quantity;
        orderItem.unitPrice = item.unitPrice;
        return orderItem;
      }),
    });

    const saved = await this.ordersRepo.save(order);

    const event: OrderCreatedEvent = {
      orderId: saved.id,
      userId: saved.userId,
      userEmail: saved.userEmail,
      items: saved.items.map((item) => ({
        productId: item.productId,
        name: item.productName,
        quantity: item.quantity,
        unitPrice: Number(item.unitPrice),
      })),
      total: Number(saved.total),
      createdAt: saved.createdAt.toISOString(),
    };

    await firstValueFrom(this.kafkaClient.emit(KAFKA_TOPICS.ORDER_CREATED, event));
    this.logger.log(`Order created and event emitted: ${saved.id}`);

    return this.toResult(saved);
  }

  async findByUser(userId: string): Promise<OrderResult[]> {
    const orders = await this.ordersRepo.find({ where: { userId } });
    return orders.map(this.toResult);
  }

  async findById(id: string, userId: string): Promise<OrderResult> {
    const order = await this.ordersRepo.findOne({ where: { id, userId } });
    if (!order) throw new OrderNotFoundError(id);
    return this.toResult(order);
  }

  private toResult(order: OrderEntity): OrderResult {
    return {
      id: order.id,
      userId: order.userId,
      userEmail: order.userEmail,
      status: order.status,
      total: Number(order.total),
      items: order.items.map((item) => ({
        id: item.id,
        productId: item.productId,
        productName: item.productName,
        quantity: item.quantity,
        unitPrice: Number(item.unitPrice),
      })),
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
    };
  }
}
