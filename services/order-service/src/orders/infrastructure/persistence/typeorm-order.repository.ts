import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { IOrderRepository } from '../../domain/repositories/order.repository';
import { Order } from '../../domain/entities/order';
import { OrderOrmEntity } from './order.orm-entity';
import { OrderItemOrmEntity } from './order-item.orm-entity';
import { OrderMapper } from './order.mapper';

@Injectable()
export class TypeOrmOrderRepository implements IOrderRepository {
  constructor(
    @InjectRepository(OrderOrmEntity)
    private readonly repo: Repository<OrderOrmEntity>,
  ) {}

  async findById(id: string, manager?: EntityManager): Promise<Order | null> {
    const repo = manager?.getRepository(OrderOrmEntity) ?? this.repo;
    const orm = await repo.findOne({ where: { id } });
    return orm ? OrderMapper.toDomain(orm) : null;
  }

  async findByUser(userId: string): Promise<Order[]> {
    const orms = await this.repo.find({ where: { userId } });
    return orms.map(OrderMapper.toDomain);
  }

  async save(data: Order, manager?: EntityManager): Promise<Order> {
    const repo = manager?.getRepository(OrderOrmEntity) ?? this.repo;
    const saved = await repo.save(OrderMapper.toOrm(data));
    return OrderMapper.toDomain(saved);
  }

  async update(order: Order, manager?: EntityManager): Promise<Order> {
    const repo = manager?.getRepository(OrderOrmEntity) ?? this.repo;
    const itemRepo = manager?.getRepository(OrderItemOrmEntity) ?? this.repo.manager.getRepository(OrderItemOrmEntity);

    await repo.update({ id: order.id }, { status: order.status, total: order.total });

    for (const item of order.items) {
      if (item.id) {
        await itemRepo.update({ id: item.id }, { productName: item.productName, unitPrice: item.unitPrice });
      }
    }

    return order;
  }
}
