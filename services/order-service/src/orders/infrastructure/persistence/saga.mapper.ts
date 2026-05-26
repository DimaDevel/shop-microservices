import { Saga, SagaStep, SagaStatus } from '../../domain/entities/saga';
import { SagaStateOrmEntity } from './saga-state.orm-entity';

export class SagaMapper {
  static toDomain(orm: SagaStateOrmEntity): Saga {
    return new Saga(
      orm.id,
      orm.orderId,
      orm.correlationId ?? '',
      orm.currentStep as SagaStep,
      orm.status as SagaStatus,
      orm.retryCount,
      orm.lastError,
      orm.nextRetryAt,
      orm.createdAt,
      orm.updatedAt,
    );
  }

  static toOrm(data: Saga): SagaStateOrmEntity {
    const entity = new SagaStateOrmEntity();
    entity.orderId = data.orderId;
    entity.correlationId = data.correlationId;
    entity.currentStep = data.currentStep;
    entity.status = data.status;
    entity.retryCount = data.retryCount;
    entity.lastError = data.lastError;
    entity.nextRetryAt = data.nextRetryAt;
    return entity;
  }
}
