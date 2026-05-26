import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { SagaOrchestrator } from './saga-orchestrator.service';
import { ORDER_REPOSITORY } from '../../domain/repositories/order.repository';
import { SAGA_REPOSITORY } from '../../domain/repositories/saga.repository';
import { OUTBOX_REPOSITORY } from '../../domain/repositories/outbox.repository';
import { Order, OrderStatus } from '../../domain/entities/order';
import { Saga, SagaStep, SagaStatus } from '../../domain/entities/saga';
import { OrderItem } from '../../domain/entities/order-item';

const makeOrder = (status: OrderStatus = OrderStatus.CONFIRMED): Order =>
  new Order(
    'order-1',
    'user-1',
    'user@example.com',
    status,
    50,
    [new OrderItem('item-1', 'prod-1', 'Widget', 2, 25)],
    new Date(),
    new Date(),
  );

const makeSaga = (step: SagaStep = SagaStep.RESERVE_STOCK, status: SagaStatus = SagaStatus.RUNNING): Saga =>
  new Saga('saga-1', 'order-1', 'corr-1', step, status, 0, null, new Date(), new Date(), new Date());

describe('SagaOrchestrator', () => {
  let orchestrator: SagaOrchestrator;
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
  let fakeManager: object;

  beforeEach(async () => {
    fakeManager = {};
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
      transaction: jest.fn().mockImplementation((cb: (m: unknown) => Promise<unknown>) => cb(fakeManager)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SagaOrchestrator,
        { provide: ORDER_REPOSITORY, useValue: orderRepo },
        { provide: SAGA_REPOSITORY, useValue: sagaRepo },
        { provide: OUTBOX_REPOSITORY, useValue: outboxRepo },
        { provide: DataSource, useValue: dataSource },
      ],
    }).compile();

    orchestrator = module.get(SagaOrchestrator);
  });

  describe('onStockReserved', () => {
    it('advances saga, confirms order, and writes PROCESS_PAYMENT command', async () => {
      const saga = makeSaga(SagaStep.RESERVE_STOCK);
      const order = makeOrder(OrderStatus.PENDING);
      sagaRepo.findByOrderIdWithLock.mockResolvedValue(saga);
      orderRepo.findById.mockResolvedValue(order);
      orderRepo.update.mockResolvedValue(order);
      sagaRepo.update.mockResolvedValue(saga.advance());
      outboxRepo.write.mockResolvedValue(undefined);

      await orchestrator.onStockReserved({
        commandId: 'cmd-1',
        orderId: 'order-1',
        correlationId: 'corr-1',
        total: 50,
        items: [{ productId: 'prod-1', name: 'Widget', unitPrice: 25, quantity: 2 }],
      });

      expect(sagaRepo.update).toHaveBeenCalledWith(
        expect.objectContaining({ currentStep: SagaStep.PROCESS_PAYMENT }),
        fakeManager,
      );
      expect(orderRepo.update).toHaveBeenCalledTimes(1);
      expect(outboxRepo.write).toHaveBeenCalledTimes(1);
    });

    it('is a no-op when canHandle returns false (duplicate event)', async () => {
      sagaRepo.findByOrderIdWithLock.mockResolvedValue(makeSaga(SagaStep.PROCESS_PAYMENT));

      await orchestrator.onStockReserved({
        commandId: 'cmd-1',
        orderId: 'order-1',
        correlationId: 'corr-1',
        total: 50,
        items: [],
      });

      expect(sagaRepo.update).not.toHaveBeenCalled();
      expect(outboxRepo.write).not.toHaveBeenCalled();
    });
  });

  describe('onStockReservationFailed', () => {
    it('cancels order and fails saga when stock could not be reserved', async () => {
      const saga = makeSaga(SagaStep.RESERVE_STOCK);
      const order = makeOrder(OrderStatus.PENDING);
      sagaRepo.findByOrderIdWithLock.mockResolvedValue(saga);
      orderRepo.findById.mockResolvedValue(order);
      orderRepo.update.mockResolvedValue(undefined);
      sagaRepo.update.mockResolvedValue(undefined);
      outboxRepo.write.mockResolvedValue(undefined);

      await orchestrator.onStockReservationFailed({
        commandId: 'cmd-1',
        orderId: 'order-1',
        correlationId: 'corr-1',
        reason: 'out of stock',
      });

      expect(sagaRepo.update).toHaveBeenCalledWith(expect.objectContaining({ status: SagaStatus.FAILED }), fakeManager);
      expect(outboxRepo.write).toHaveBeenCalledTimes(1);
    });

    it('is a no-op for duplicate event', async () => {
      sagaRepo.findByOrderIdWithLock.mockResolvedValue(makeSaga(SagaStep.PROCESS_PAYMENT));

      await orchestrator.onStockReservationFailed({
        commandId: 'cmd-1',
        orderId: 'order-1',
        correlationId: 'corr-1',
        reason: 'out of stock',
      });

      expect(outboxRepo.write).not.toHaveBeenCalled();
    });
  });

  describe('onPaymentProcessed', () => {
    it('advances saga to COMPLETED and writes ORDER_CONFIRMED event', async () => {
      const saga = makeSaga(SagaStep.PROCESS_PAYMENT);
      const order = makeOrder(OrderStatus.CONFIRMED);
      sagaRepo.findByOrderIdWithLock.mockResolvedValue(saga);
      orderRepo.findById.mockResolvedValue(order);
      sagaRepo.update.mockResolvedValue(saga.advance());
      outboxRepo.write.mockResolvedValue(undefined);

      await orchestrator.onPaymentProcessed({
        commandId: 'cmd-1',
        orderId: 'order-1',
        correlationId: 'corr-1',
        transactionId: 'txn-1',
      });

      expect(sagaRepo.update).toHaveBeenCalledWith(
        expect.objectContaining({ currentStep: SagaStep.COMPLETED }),
        fakeManager,
      );
      expect(outboxRepo.write).toHaveBeenCalledTimes(1);
    });

    it('is a no-op for duplicate event', async () => {
      sagaRepo.findByOrderIdWithLock.mockResolvedValue(makeSaga(SagaStep.RESERVE_STOCK));

      await orchestrator.onPaymentProcessed({
        commandId: 'cmd-1',
        orderId: 'order-1',
        correlationId: 'corr-1',
        transactionId: 'txn-1',
      });

      expect(outboxRepo.write).not.toHaveBeenCalled();
    });
  });

  describe('onPaymentFailed', () => {
    it('starts compensation (RELEASE_STOCK) and writes ReleaseStock command', async () => {
      const saga = makeSaga(SagaStep.PROCESS_PAYMENT);
      const order = makeOrder(OrderStatus.CONFIRMED);
      sagaRepo.findByOrderIdWithLock.mockResolvedValue(saga);
      orderRepo.findById.mockResolvedValue(order);
      sagaRepo.update.mockResolvedValue(undefined);
      outboxRepo.write.mockResolvedValue(undefined);

      await orchestrator.onPaymentFailed({
        commandId: 'cmd-1',
        orderId: 'order-1',
        correlationId: 'corr-1',
        reason: 'insufficient funds',
      });

      expect(sagaRepo.update).toHaveBeenCalledWith(
        expect.objectContaining({ currentStep: SagaStep.RELEASE_STOCK }),
        fakeManager,
      );
      expect(outboxRepo.write).toHaveBeenCalledTimes(1);
    });

    it('is a no-op for duplicate event', async () => {
      sagaRepo.findByOrderIdWithLock.mockResolvedValue(makeSaga(SagaStep.RESERVE_STOCK));

      await orchestrator.onPaymentFailed({
        commandId: 'cmd-1',
        orderId: 'order-1',
        correlationId: 'corr-1',
        reason: 'insufficient funds',
      });

      expect(outboxRepo.write).not.toHaveBeenCalled();
    });
  });

  describe('onStockReleased', () => {
    it('cancels order and fails saga after compensation', async () => {
      const saga = makeSaga(SagaStep.RELEASE_STOCK);
      const order = makeOrder(OrderStatus.CONFIRMED);
      sagaRepo.findByOrderIdWithLock.mockResolvedValue(saga);
      orderRepo.findById.mockResolvedValue(order);
      orderRepo.update.mockResolvedValue(undefined);
      sagaRepo.update.mockResolvedValue(undefined);
      outboxRepo.write.mockResolvedValue(undefined);

      await orchestrator.onStockReleased({ commandId: 'cmd-1', orderId: 'order-1', correlationId: 'corr-1' });

      expect(sagaRepo.update).toHaveBeenCalledWith(expect.objectContaining({ status: SagaStatus.FAILED }), fakeManager);
    });

    it('is a no-op for duplicate event', async () => {
      sagaRepo.findByOrderIdWithLock.mockResolvedValue(makeSaga(SagaStep.PROCESS_PAYMENT));

      await orchestrator.onStockReleased({ commandId: 'cmd-1', orderId: 'order-1', correlationId: 'corr-1' });

      expect(outboxRepo.write).not.toHaveBeenCalled();
    });
  });

  describe('retryStuckSagas', () => {
    it('marks saga FAILED when max retries exceeded', async () => {
      const stuckSaga = new Saga(
        'saga-1',
        'order-1',
        'corr-1',
        SagaStep.RESERVE_STOCK,
        SagaStatus.RUNNING,
        Saga.MAX_RETRIES,
        null,
        new Date(),
        new Date(),
        new Date(),
      );
      sagaRepo.findStuck.mockResolvedValue([stuckSaga]);
      sagaRepo.findByIdSkipLocked.mockResolvedValue(stuckSaga);
      sagaRepo.update.mockResolvedValue(undefined);

      await orchestrator.retryStuckSagas();

      expect(sagaRepo.update).toHaveBeenCalledWith(expect.objectContaining({ status: SagaStatus.FAILED }), fakeManager);
    });

    it('increments retryCount and resends command when retries remain', async () => {
      const stuckSaga = makeSaga(SagaStep.RESERVE_STOCK);
      const order = makeOrder(OrderStatus.PENDING);
      sagaRepo.findStuck.mockResolvedValue([stuckSaga]);
      sagaRepo.findByIdSkipLocked.mockResolvedValue(stuckSaga);
      sagaRepo.update.mockResolvedValue(undefined);
      orderRepo.findById.mockResolvedValue(order);
      outboxRepo.write.mockResolvedValue(undefined);

      await orchestrator.retryStuckSagas();

      expect(sagaRepo.update).toHaveBeenCalledWith(expect.objectContaining({ retryCount: 1 }), fakeManager);
      expect(outboxRepo.write).toHaveBeenCalledTimes(1);
    });

    it('logs error and returns early when findStuck itself throws', async () => {
      sagaRepo.findStuck.mockRejectedValue(new Error('db down'));

      await expect(orchestrator.retryStuckSagas()).resolves.not.toThrow();
      expect(sagaRepo.findByIdSkipLocked).not.toHaveBeenCalled();
    });

    it('skips saga locked by another worker (findByIdSkipLocked returns null)', async () => {
      sagaRepo.findStuck.mockResolvedValue([makeSaga()]);
      sagaRepo.findByIdSkipLocked.mockResolvedValue(null);

      await orchestrator.retryStuckSagas();

      expect(sagaRepo.update).not.toHaveBeenCalled();
    });

    it('logs error and continues to next saga when one transaction fails', async () => {
      const saga1 = new Saga(
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
      const saga2 = new Saga(
        'saga-2',
        'order-2',
        'corr-2',
        SagaStep.RESERVE_STOCK,
        SagaStatus.RUNNING,
        0,
        null,
        new Date(),
        new Date(),
        new Date(),
      );
      const goodOrder = makeOrder(OrderStatus.PENDING);

      sagaRepo.findStuck.mockResolvedValue([saga1, saga2]);
      sagaRepo.findByIdSkipLocked
        .mockResolvedValueOnce(saga1) // first saga — order missing
        .mockResolvedValueOnce(saga2); // second saga — succeeds
      sagaRepo.update.mockResolvedValue(undefined);
      orderRepo.findById
        .mockResolvedValueOnce(null) // causes OrderNotFoundError for saga1
        .mockResolvedValueOnce(goodOrder); // saga2 succeeds
      outboxRepo.write.mockResolvedValue(undefined);

      await expect(orchestrator.retryStuckSagas()).resolves.not.toThrow();
      // saga2 should still be retried even after saga1 failed
      expect(sagaRepo.update).toHaveBeenCalledTimes(2);
    });
  });
});
