import { OrderItem } from './order-item';
import { InvalidOrderTransitionError } from '../errors/orders.errors';

export enum OrderStatus {
  PENDING = 'pending',
  CONFIRMED = 'confirmed',
  CANCELLED = 'cancelled',
  COMPLETED = 'completed',
}

export class Order {
  constructor(
    readonly id: string,
    readonly userId: string,
    readonly userEmail: string,
    readonly status: OrderStatus,
    readonly total: number,
    readonly items: OrderItem[],
    readonly createdAt: Date,
    readonly updatedAt: Date,
  ) {}

  static create(
    userId: string,
    userEmail: string,
    items: Array<{ productId: string; quantity: number }>,
  ): Order {
    const now = new Date();
    return new Order(
      '',
      userId,
      userEmail,
      OrderStatus.PENDING,
      0,
      items.map((i) => new OrderItem('', i.productId, '', i.quantity, 0)),
      now,
      now,
    );
  }

  confirm(
    total: number,
    itemDetails: Array<{ productId: string; name: string; unitPrice: number }>,
  ): Order {
    if (this.status !== OrderStatus.PENDING) {
      throw new InvalidOrderTransitionError(this.status, OrderStatus.CONFIRMED);
    }
    const updatedItems = this.items.map((item) => {
      const detail = itemDetails.find((d) => d.productId === item.productId);
      return detail
        ? new OrderItem(item.id, item.productId, detail.name, item.quantity, detail.unitPrice)
        : item;
    });
    return new Order(this.id, this.userId, this.userEmail, OrderStatus.CONFIRMED, total, updatedItems, this.createdAt, new Date());
  }

  cancel(): Order {
    if (this.status === OrderStatus.CONFIRMED || this.status === OrderStatus.COMPLETED) {
      throw new InvalidOrderTransitionError(this.status, OrderStatus.CANCELLED);
    }
    return new Order(this.id, this.userId, this.userEmail, OrderStatus.CANCELLED, this.total, this.items, this.createdAt, new Date());
  }

  // Used by saga compensation — may cancel from PENDING or CONFIRMED, not after COMPLETED
  compensate(): Order {
    if (this.status === OrderStatus.COMPLETED || this.status === OrderStatus.CANCELLED) {
      throw new InvalidOrderTransitionError(this.status, OrderStatus.CANCELLED);
    }
    return new Order(this.id, this.userId, this.userEmail, OrderStatus.CANCELLED, this.total, this.items, this.createdAt, new Date());
  }
}
