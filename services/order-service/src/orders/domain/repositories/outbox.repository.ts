import { EntityManager } from 'typeorm';

export const OUTBOX_REPOSITORY = Symbol('OUTBOX_REPOSITORY');

export interface OutboxRecord {
  id: string;
  topic: string;
  messageKey: string;
  payload: object;
  retryCount: number;
}

export interface IOutboxRepository {
  write(aggregateId: string, topic: string, key: string, payload: object, manager: EntityManager): Promise<void>;
  findPendingWithLock(limit: number, manager: EntityManager): Promise<OutboxRecord[]>;
  markPublished(id: string, manager: EntityManager): Promise<void>;
  scheduleRetry(id: string, retryCount: number, error: string, scheduledAt: Date, manager: EntityManager): Promise<void>;
  permanentlyFail(id: string, retryCount: number, error: string, manager: EntityManager): Promise<void>;
}
