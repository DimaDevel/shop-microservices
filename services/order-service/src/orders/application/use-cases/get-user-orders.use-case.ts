import { Injectable, Inject } from '@nestjs/common';
import { IOrderRepository, ORDER_REPOSITORY } from '../../domain/repositories/order.repository';
import { OrderResult } from './create-order.use-case';
import { Order } from '../../domain/entities/order';

@Injectable()
export class GetUserOrdersUseCase {
  constructor(
    @Inject(ORDER_REPOSITORY) private readonly orderRepo: IOrderRepository,
  ) {}

  async execute(userId: string): Promise<OrderResult[]> {
    const orders = await this.orderRepo.findByUser(userId);
    return orders.map(this.toResult);
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
