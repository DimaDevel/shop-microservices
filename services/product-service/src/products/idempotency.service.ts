import { Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { IdempotencyKeyEntity } from './idempotency.entity';

export interface StoredResult {
  replyTopic: string;
  replyPayload: object;
}

@Injectable()
export class IdempotencyService {
  async find(manager: EntityManager, key: string): Promise<StoredResult | null> {
    const record = await manager
      .getRepository(IdempotencyKeyEntity)
      .findOne({ where: { key } });
    if (!record) return null;
    return { replyTopic: record.replyTopic, replyPayload: record.replyPayload };
  }

  async save(
    manager: EntityManager,
    key: string,
    replyTopic: string,
    replyPayload: object,
  ): Promise<void> {
    const repo = manager.getRepository(IdempotencyKeyEntity);
    await repo.save(repo.create({ key, replyTopic, replyPayload }));
  }
}
