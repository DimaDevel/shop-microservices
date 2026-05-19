import { Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { OutboxEntity } from './outbox.entity';

@Injectable()
export class OutboxService {
  async write(
    manager: EntityManager,
    aggregateId: string,
    topic: string,
    messageKey: string,
    payload: object,
  ): Promise<void> {
    const repo = manager.getRepository(OutboxEntity);
    await repo.save(repo.create({ aggregateId, topic, messageKey, payload }));
  }
}
