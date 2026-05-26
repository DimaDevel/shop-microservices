import { EntityManager } from 'typeorm';
import { Saga } from '../entities/saga';

export const SAGA_REPOSITORY = Symbol('SAGA_REPOSITORY');

export interface ISagaRepository {
  findByOrderIdWithLock(orderId: string, manager: EntityManager): Promise<Saga | null>;
  findByIdSkipLocked(id: string, manager: EntityManager): Promise<Saga | null>;
  findStuck(limit: number): Promise<Saga[]>;
  save(data: Saga, manager?: EntityManager): Promise<Saga>;
  update(saga: Saga, manager?: EntityManager): Promise<Saga>;
}
