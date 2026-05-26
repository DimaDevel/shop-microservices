import { Injectable, Inject } from '@nestjs/common';
import { IOrderRepository, ORDER_REPOSITORY } from '../../domain/repositories/order.repository';
import { OrderNotFoundError } from '../../domain/errors/orders.errors';
import { OrderResult } from './create-order.use-case';
import { Order } from '../../domain/entities/order';

@Injectable()
export class GetOrderUseCase {
  constructor(
    @Inject(ORDER_REPOSITORY) private readonly orderRepo: IOrderRepository,
  ) {}

  async execute(id: string, userId: string): Promise<OrderResult> {
    const order = await this.orderRepo.findById(id);
    if (!order || order.userId !== userId) throw new OrderNotFoundError(id);
    return this.toResult(order);
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
