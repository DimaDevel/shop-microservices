import { EntityManager } from 'typeorm';
import { Order } from '../entities/order';

export const ORDER_REPOSITORY = Symbol('ORDER_REPOSITORY');

export interface IOrderRepository {
  findById(id: string, manager?: EntityManager): Promise<Order | null>;
  findByUser(userId: string, page: number, limit: number): Promise<{ items: Order[]; total: number }>;
  save(data: Order, manager?: EntityManager): Promise<Order>;
  update(order: Order, manager?: EntityManager): Promise<Order>;
}
