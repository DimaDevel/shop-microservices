import { Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { IOutboxRepository, OutboxRecord } from '../../domain/repositories/outbox.repository';
import { OutboxOrmEntity, OutboxStatus } from './outbox.orm-entity';

@Injectable()
export class TypeOrmOutboxRepository implements IOutboxRepository {
  async write(aggregateId: string, topic: string, key: string, payload: object, manager: EntityManager): Promise<void> {
    const repo = manager.getRepository(OutboxOrmEntity);
    await repo.save(repo.create({ aggregateId, topic, messageKey: key, payload }));
  }

  async findPendingWithLock(limit: number, manager: EntityManager): Promise<OutboxRecord[]> {
    const orms = await manager
      .createQueryBuilder(OutboxOrmEntity, 'outbox')
      .where('outbox.status = :status', { status: OutboxStatus.PENDING })
      .andWhere('outbox.scheduledAt <= :now', { now: new Date() })
      .orderBy('outbox.scheduledAt', 'ASC')
      .limit(limit)
      .setLock('pessimistic_partial_write')
      .getMany();

    return orms.map((o) => ({
      id: o.id,
      topic: o.topic,
      messageKey: o.messageKey,
      payload: o.payload,
      retryCount: o.retryCount,
    }));
  }

  async markPublished(id: string, manager: EntityManager): Promise<void> {
    await manager.getRepository(OutboxOrmEntity).update(id, {
      status: OutboxStatus.PUBLISHED,
      publishedAt: new Date(),
    });
  }

  async scheduleRetry(
    id: string,
    retryCount: number,
    error: string,
    scheduledAt: Date,
    manager: EntityManager,
  ): Promise<void> {
    await manager.getRepository(OutboxOrmEntity).update(id, {
      status: OutboxStatus.PENDING,
      retryCount,
      lastError: error,
      scheduledAt,
    });
  }

  async permanentlyFail(id: string, retryCount: number, error: string, manager: EntityManager): Promise<void> {
    await manager.getRepository(OutboxOrmEntity).update(id, {
      status: OutboxStatus.FAILED,
      retryCount,
      lastError: error,
    });
  }
}
