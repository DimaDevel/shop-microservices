import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { CreateOrderUseCase, CreateOrderInput } from './create-order.use-case';
import { ORDER_REPOSITORY } from '../../domain/repositories/order.repository';
import { SAGA_REPOSITORY } from '../../domain/repositories/saga.repository';
import { OUTBOX_REPOSITORY } from '../../domain/repositories/outbox.repository';
import { Order, OrderStatus } from '../../domain/entities/order';
import { Saga, SagaStep, SagaStatus } from '../../domain/entities/saga';
import { OrderItem } from '../../domain/entities/order-item';

const makeSavedOrder = (): Order =>
  new Order(
    'order-1',
    'user-1',
    'user@example.com',
    OrderStatus.PENDING,
    0,
    [new OrderItem('item-1', 'prod-1', '', 2, 0)],
    new Date(),
    new Date(),
  );

const makeSavedSaga = (): Saga =>
  new Saga(
    'saga-1',
    'order-1',
    'corr-1',
    SagaStep.RESERVE_STOCK,
    SagaStatus.RUNNING,
    0,
    null,
    new Date(),
    new Date(),
    new Date(),
  );

describe('CreateOrderUseCase', () => {
  let useCase: CreateOrderUseCase;
  let orderRepo: { save: jest.Mock; findById: jest.Mock; findByUser: jest.Mock; update: jest.Mock };
  let sagaRepo: {
    save: jest.Mock;
    findByOrderIdWithLock: jest.Mock;
    findByIdSkipLocked: jest.Mock;
    findStuck: jest.Mock;
    update: jest.Mock;
  };
  let outboxRepo: { write: jest.Mock };
  let dataSource: { transaction: jest.Mock };

  beforeEach(async () => {
    orderRepo = { save: jest.fn(), findById: jest.fn(), findByUser: jest.fn(), update: jest.fn() };
    sagaRepo = {
      save: jest.fn(),
      findByOrderIdWithLock: jest.fn(),
      findByIdSkipLocked: jest.fn(),
      findStuck: jest.fn(),
      update: jest.fn(),
    };
    outboxRepo = { write: jest.fn() };
    dataSource = {
      transaction: jest.fn().mockImplementation((cb: (manager: unknown) => Promise<unknown>) => cb({})),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CreateOrderUseCase,
        { provide: ORDER_REPOSITORY, useValue: orderRepo },
        { provide: SAGA_REPOSITORY, useValue: sagaRepo },
        { provide: OUTBOX_REPOSITORY, useValue: outboxRepo },
        { provide: DataSource, useValue: dataSource },
      ],
    }).compile();

    useCase = module.get(CreateOrderUseCase);
  });

  it('saves order, saga, and outbox entry, then returns OrderResult', async () => {
    const savedOrder = makeSavedOrder();
    const savedSaga = makeSavedSaga();

    orderRepo.save.mockResolvedValue(savedOrder);
    sagaRepo.save.mockResolvedValue(savedSaga);
    outboxRepo.write.mockResolvedValue(undefined);

    const input: CreateOrderInput = {
      userId: 'user-1',
      userEmail: 'user@example.com',
      correlationId: 'corr-1',
      items: [{ productId: 'prod-1', quantity: 2 }],
    };

    const result = await useCase.execute(input);

    expect(orderRepo.save).toHaveBeenCalledTimes(1);
    expect(sagaRepo.save).toHaveBeenCalledTimes(1);
    expect(outboxRepo.write).toHaveBeenCalledTimes(1);

    expect(result.id).toBe('order-1');
    expect(result.status).toBe(OrderStatus.PENDING);
    expect(result.total).toBe(0);
    expect(result.items).toHaveLength(1);
  });

  it('runs inside a single transaction', async () => {
    orderRepo.save.mockResolvedValue(makeSavedOrder());
    sagaRepo.save.mockResolvedValue(makeSavedSaga());
    outboxRepo.write.mockResolvedValue(undefined);

    await useCase.execute({
      userId: 'user-1',
      userEmail: 'user@example.com',
      correlationId: 'corr-1',
      items: [{ productId: 'prod-1', quantity: 1 }],
    });

    expect(dataSource.transaction).toHaveBeenCalledTimes(1);
  });

  it('passes the entity manager to every repository call', async () => {
    const fakeManager = { marker: 'fake-manager' };
    dataSource.transaction.mockImplementation((cb: (manager: unknown) => Promise<unknown>) => cb(fakeManager));

    orderRepo.save.mockResolvedValue(makeSavedOrder());
    sagaRepo.save.mockResolvedValue(makeSavedSaga());
    outboxRepo.write.mockResolvedValue(undefined);

    await useCase.execute({
      userId: 'user-1',
      userEmail: 'user@example.com',
      correlationId: 'corr-1',
      items: [{ productId: 'prod-1', quantity: 1 }],
    });

    expect(orderRepo.save.mock.calls[0][1]).toBe(fakeManager);
    expect(sagaRepo.save.mock.calls[0][1]).toBe(fakeManager);
    expect(outboxRepo.write.mock.calls[0][4]).toBe(fakeManager);
  });
});
