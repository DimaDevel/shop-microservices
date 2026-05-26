import { Injectable, Inject } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { IOrderRepository, ORDER_REPOSITORY } from '../../domain/repositories/order.repository';
import { ISagaRepository, SAGA_REPOSITORY } from '../../domain/repositories/saga.repository';
import { IOutboxRepository, OUTBOX_REPOSITORY } from '../../domain/repositories/outbox.repository';
import { Order } from '../../domain/entities/order';
import { Saga } from '../../domain/entities/saga';
import { KAFKA_TOPICS, ReserveStockCommand } from '@nest-gateway/shared';

export interface CreateOrderInput {
  userId: string;
  userEmail: string;
  correlationId: string;
  items: Array<{ productId: string; quantity: number }>;
}

export interface OrderItemResult {
  id: string;
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
}

export interface OrderResult {
  id: string;
  userId: string;
  userEmail: string;
  status: string;
  total: number;
  items: OrderItemResult[];
  createdAt: Date;
  updatedAt: Date;
}

@Injectable()
export class CreateOrderUseCase {
  constructor(
    @Inject(ORDER_REPOSITORY) private readonly orderRepo: IOrderRepository,
    @Inject(SAGA_REPOSITORY) private readonly sagaRepo: ISagaRepository,
    @Inject(OUTBOX_REPOSITORY) private readonly outboxRepo: IOutboxRepository,
    private readonly dataSource: DataSource,
  ) {}

  async execute(input: CreateOrderInput): Promise<OrderResult> {
    return this.dataSource.transaction(async (manager) => {
      const order = await this.orderRepo.save(Order.create(input.userId, input.userEmail, input.items), manager);

      const saga = await this.sagaRepo.save(Saga.create(order.id, input.correlationId), manager);

      const command: ReserveStockCommand = {
        commandId: saga.id,
        orderId: order.id,
        correlationId: input.correlationId,
        items: input.items,
      };

      await this.outboxRepo.write(order.id, KAFKA_TOPICS.RESERVE_STOCK, order.id, command, manager);

      return this.toResult(order);
    });
  }

  private toResult(order: Order): OrderResult {
    return {
      id: order.id,
      userId: order.userId,
      userEmail: order.userEmail,
      status: order.status,
      total: order.total,
      items: order.items.map((i) => ({
        id: i.id,
        productId: i.productId,
        productName: i.productName,
        quantity: i.quantity,
        unitPrice: i.unitPrice,
      })),
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
    };
  }
}
