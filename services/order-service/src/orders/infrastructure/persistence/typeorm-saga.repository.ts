import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, LessThanOrEqual, Repository } from 'typeorm';
import { ISagaRepository } from '../../domain/repositories/saga.repository';
import { Saga, SagaStatus } from '../../domain/entities/saga';
import { SagaStateOrmEntity } from './saga-state.orm-entity';
import { SagaMapper } from './saga.mapper';

@Injectable()
export class TypeOrmSagaRepository implements ISagaRepository {
  constructor(
    @InjectRepository(SagaStateOrmEntity)
    private readonly repo: Repository<SagaStateOrmEntity>,
  ) {}

  async findByOrderIdWithLock(orderId: string, manager: EntityManager): Promise<Saga | null> {
    const orm = await manager
      .getRepository(SagaStateOrmEntity)
      .createQueryBuilder('saga')
      .where('saga.orderId = :orderId', { orderId })
      .setLock('pessimistic_write')
      .getOne();
    return orm ? SagaMapper.toDomain(orm) : null;
  }

  async findByIdSkipLocked(id: string, manager: EntityManager): Promise<Saga | null> {
    const orm = await manager
      .getRepository(SagaStateOrmEntity)
      .createQueryBuilder('saga')
      .where('saga.id = :id', { id })
      .andWhere('saga.status = :status', { status: SagaStatus.RUNNING })
      .setLock('pessimistic_partial_write')
      .getOne();
    return orm ? SagaMapper.toDomain(orm) : null;
  }

  async findStuck(limit: number): Promise<Saga[]> {
    const orms = await this.repo.find({
      where: { status: SagaStatus.RUNNING, nextRetryAt: LessThanOrEqual(new Date()) },
      take: limit,
    });
    return orms.map(SagaMapper.toDomain);
  }

  async save(data: Saga, manager?: EntityManager): Promise<Saga> {
    const repo = manager?.getRepository(SagaStateOrmEntity) ?? this.repo;
    const saved = await repo.save(SagaMapper.toOrm(data));
    return SagaMapper.toDomain(saved);
  }

  async update(saga: Saga, manager?: EntityManager): Promise<Saga> {
    const repo = manager?.getRepository(SagaStateOrmEntity) ?? this.repo;
    await repo.update(
      { id: saga.id },
      {
        currentStep: saga.currentStep,
        status: saga.status,
        retryCount: saga.retryCount,
        lastError: saga.lastError,
        nextRetryAt: saga.nextRetryAt,
      },
    );
    return saga;
  }
}
