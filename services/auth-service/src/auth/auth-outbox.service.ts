import { Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { AuthOutboxEntity } from './auth-outbox.entity';

@Injectable()
export class AuthOutboxService {
  async write(
    manager: EntityManager,
    aggregateId: string,
    topic: string,
    messageKey: string,
    payload: object,
  ): Promise<void> {
    const repo = manager.getRepository(AuthOutboxEntity);
    await repo.save(repo.create({ aggregateId, topic, messageKey, payload }));
  }
}
