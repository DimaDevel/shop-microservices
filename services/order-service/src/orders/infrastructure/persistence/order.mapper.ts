import { Order, OrderStatus } from '../../domain/entities/order';
import { OrderItem } from '../../domain/entities/order-item';
import { OrderOrmEntity } from './order.orm-entity';
import { OrderItemOrmEntity } from './order-item.orm-entity';

export class OrderMapper {
  static toDomain(orm: OrderOrmEntity): Order {
    return new Order(
      orm.id,
      orm.userId,
      orm.userEmail,
      orm.status as OrderStatus,
      Number(orm.total),
      (orm.items ?? []).map(
        (i) => new OrderItem(i.id, i.productId, i.productName, i.quantity, Number(i.unitPrice)),
      ),
      orm.createdAt,
      orm.updatedAt,
    );
  }

  static toOrm(data: Order): OrderOrmEntity {
    const entity = new OrderOrmEntity();
    entity.userId = data.userId;
    entity.userEmail = data.userEmail;
    entity.status = data.status;
    entity.total = data.total;
    entity.items = data.items.map((item) => {
      const itemEntity = new OrderItemOrmEntity();
      if (item.id) itemEntity.id = item.id;
      itemEntity.productId = item.productId;
      itemEntity.productName = item.productName;
      itemEntity.quantity = item.quantity;
      itemEntity.unitPrice = item.unitPrice;
      return itemEntity;
    });
    return entity;
  }
}
