import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { OrderEntity, OrderStatus } from './order.entity';
import { OrderItemEntity } from './order-item.entity';
import { CreateOrderInput } from './orders.inputs';
import { OrderResult } from './orders.outputs';
import { OrderNotFoundError } from './orders.errors';
import { SagaService } from './saga.service';

@Injectable()
export class OrdersService {
  constructor(
    @InjectRepository(OrderEntity)
    private readonly ordersRepo: Repository<OrderEntity>,
    private readonly sagaService: SagaService,
    private readonly dataSource: DataSource,
  ) {}

  async create(input: CreateOrderInput): Promise<OrderResult> {
    return this.dataSource.transaction(async (manager) => {
      const order = manager.getRepository(OrderEntity).create({
        userId: input.userId,
        userEmail: input.userEmail,
        total: 0,
        status: OrderStatus.PENDING,
        items: input.items.map((item) => {
          const orderItem = new OrderItemEntity();
          orderItem.productId = item.productId;
          orderItem.productName = '';
          orderItem.quantity = item.quantity;
          orderItem.unitPrice = 0;
          return orderItem;
        }),
      });

      const saved = await manager.getRepository(OrderEntity).save(order);
      await this.sagaService.startSaga(saved.id, input.items, input.correlationId, manager);

      return this.toResult(saved);
    });
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
      items: (order.items ?? []).map((item) => ({
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
