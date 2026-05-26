import { Test, TestingModule } from '@nestjs/testing';
import { KafkaConsumerService } from '@nest-gateway/kafka';
import { SagaReplyController } from './saga-reply.controller';
import { SagaOrchestrator } from './application/services/saga-orchestrator.service';
import { OrderNotFoundError } from './domain/errors/orders.errors';
import { KAFKA_TOPICS } from '@nest-gateway/shared';

describe('SagaReplyController', () => {
  let controller: SagaReplyController;
  let orchestrator: {
    onStockReserved: jest.Mock;
    onStockReservationFailed: jest.Mock;
    onPaymentProcessed: jest.Mock;
    onPaymentFailed: jest.Mock;
    onStockReleased: jest.Mock;
  };
  let kafkaConsumer: { subscribe: jest.Mock };
  const handlers = new Map<string, (e: any) => Promise<void>>();

  beforeEach(async () => {
    handlers.clear();
    orchestrator = {
      onStockReserved: jest.fn(),
      onStockReservationFailed: jest.fn(),
      onPaymentProcessed: jest.fn(),
      onPaymentFailed: jest.fn(),
      onStockReleased: jest.fn(),
    };
    kafkaConsumer = {
      subscribe: jest.fn().mockImplementation(({ topic, handler }) => {
        handlers.set(topic, handler);
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SagaReplyController,
        { provide: SagaOrchestrator, useValue: orchestrator },
        { provide: KafkaConsumerService, useValue: kafkaConsumer },
      ],
    }).compile();

    controller = module.get(SagaReplyController);
    controller.onModuleInit();
  });

  const envelope = (payload: object) => ({ correlationId: 'corr-1', payload });

  describe('routing', () => {
    it('routes STOCK_RESERVED to onStockReserved', async () => {
      orchestrator.onStockReserved.mockResolvedValue(undefined);
      await handlers.get(KAFKA_TOPICS.STOCK_RESERVED)!(envelope({ orderId: 'o-1' }));
      expect(orchestrator.onStockReserved).toHaveBeenCalledTimes(1);
    });

    it('routes STOCK_RESERVATION_FAILED to onStockReservationFailed', async () => {
      orchestrator.onStockReservationFailed.mockResolvedValue(undefined);
      await handlers.get(KAFKA_TOPICS.STOCK_RESERVATION_FAILED)!(envelope({ orderId: 'o-1' }));
      expect(orchestrator.onStockReservationFailed).toHaveBeenCalledTimes(1);
    });

    it('routes PAYMENT_PROCESSED to onPaymentProcessed', async () => {
      orchestrator.onPaymentProcessed.mockResolvedValue(undefined);
      await handlers.get(KAFKA_TOPICS.PAYMENT_PROCESSED)!(envelope({ orderId: 'o-1' }));
      expect(orchestrator.onPaymentProcessed).toHaveBeenCalledTimes(1);
    });

    it('routes PAYMENT_FAILED to onPaymentFailed', async () => {
      orchestrator.onPaymentFailed.mockResolvedValue(undefined);
      await handlers.get(KAFKA_TOPICS.PAYMENT_FAILED)!(envelope({ orderId: 'o-1' }));
      expect(orchestrator.onPaymentFailed).toHaveBeenCalledTimes(1);
    });

    it('routes STOCK_RELEASED to onStockReleased', async () => {
      orchestrator.onStockReleased.mockResolvedValue(undefined);
      await handlers.get(KAFKA_TOPICS.STOCK_RELEASED)!(envelope({ orderId: 'o-1' }));
      expect(orchestrator.onStockReleased).toHaveBeenCalledTimes(1);
    });
  });

  describe('error handling', () => {
    it('swallows OrderNotFoundError and does not rethrow', async () => {
      orchestrator.onStockReserved.mockRejectedValue(new OrderNotFoundError('order-1'));

      await expect(
        handlers.get(KAFKA_TOPICS.STOCK_RESERVED)!(envelope({ orderId: 'order-1' })),
      ).resolves.toBeUndefined();
    });

    it('rethrows non-domain errors so Kafka can retry', async () => {
      orchestrator.onStockReserved.mockRejectedValue(new Error('db connection lost'));

      await expect(
        handlers.get(KAFKA_TOPICS.STOCK_RESERVED)!(envelope({ orderId: 'order-1' })),
      ).rejects.toThrow('db connection lost');
    });

    it('swallows OrderNotFoundError on payment events too', async () => {
      orchestrator.onPaymentFailed.mockRejectedValue(new OrderNotFoundError('order-1'));

      await expect(
        handlers.get(KAFKA_TOPICS.PAYMENT_FAILED)!(envelope({ orderId: 'order-1' })),
      ).resolves.toBeUndefined();
    });
  });
});
