import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { KafkaConsumerService, KafkaEnvelope } from '@nest-gateway/kafka';
import { KAFKA_TOPICS } from '@nest-gateway/shared';
import { PaymentsSagaController } from './payments-saga.controller';
import { PaymentsService } from './payments.service';
import { IdempotencyService } from './idempotency.service';
import { OutboxService } from './outbox.service';
import { InsufficientFundsError, PaymentDeclinedError } from './payments.errors';

describe('PaymentsSagaController', () => {
  let controller: PaymentsSagaController;
  let paymentsService: { processPayment: jest.Mock };
  let idempotencyService: { find: jest.Mock; save: jest.Mock };
  let outboxService: { write: jest.Mock };
  let dataSource: { transaction: jest.Mock };
  let kafkaConsumer: { subscribe: jest.Mock };

  const handlers = new Map<string, (e: KafkaEnvelope<unknown>) => Promise<void>>();
  const fakeManager = {};

  const command = {
    commandId: 'cmd-1',
    orderId: 'order-1',
    correlationId: 'corr-1',
    userId: 'user-1',
    amount: 100,
  };

  beforeEach(async () => {
    handlers.clear();
    paymentsService = { processPayment: jest.fn() };
    idempotencyService = { find: jest.fn().mockResolvedValue(null), save: jest.fn().mockResolvedValue(undefined) };
    outboxService = { write: jest.fn().mockResolvedValue(undefined) };
    dataSource = {
      transaction: jest.fn().mockImplementation((cb: (manager: unknown) => Promise<unknown>) => cb(fakeManager)),
    };
    kafkaConsumer = {
      subscribe: jest.fn().mockImplementation(({ topic, handler }) => handlers.set(topic, handler)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentsSagaController,
        { provide: PaymentsService, useValue: paymentsService },
        { provide: IdempotencyService, useValue: idempotencyService },
        { provide: OutboxService, useValue: outboxService },
        { provide: DataSource, useValue: dataSource },
        { provide: KafkaConsumerService, useValue: kafkaConsumer },
      ],
    }).compile();

    controller = module.get(PaymentsSagaController);
    controller.onModuleInit();
  });

  afterEach(() => jest.clearAllMocks());

  const dispatch = (payload = command) => handlers.get(KAFKA_TOPICS.PROCESS_PAYMENT)!({ payload });

  describe('happy path', () => {
    it('writes PAYMENT_PROCESSED to outbox when payment succeeds', async () => {
      paymentsService.processPayment.mockResolvedValue({ transactionId: 'txn-abc' });

      await dispatch();

      expect(outboxService.write).toHaveBeenCalledWith(
        fakeManager,
        command.orderId,
        KAFKA_TOPICS.PAYMENT_PROCESSED,
        command.orderId,
        expect.objectContaining({ transactionId: 'txn-abc', orderId: command.orderId }),
      );
    });
  });

  describe('payment failure paths', () => {
    it('writes PAYMENT_FAILED to outbox when PaymentDeclinedError is thrown', async () => {
      paymentsService.processPayment.mockRejectedValue(new PaymentDeclinedError('declined'));

      await dispatch();

      expect(outboxService.write).toHaveBeenCalledWith(
        fakeManager,
        command.orderId,
        KAFKA_TOPICS.PAYMENT_FAILED,
        command.orderId,
        expect.objectContaining({ reason: 'declined', orderId: command.orderId }),
      );
    });

    it('writes PAYMENT_FAILED to outbox when InsufficientFundsError is thrown', async () => {
      paymentsService.processPayment.mockRejectedValue(new InsufficientFundsError(50, 100));

      await dispatch();

      expect(outboxService.write).toHaveBeenCalledWith(
        fakeManager,
        command.orderId,
        KAFKA_TOPICS.PAYMENT_FAILED,
        command.orderId,
        expect.objectContaining({ orderId: command.orderId }),
      );
    });

    it('does not write a success reply when payment fails', async () => {
      paymentsService.processPayment.mockRejectedValue(new InsufficientFundsError(0, 100));

      await dispatch();

      const successCalls = outboxService.write.mock.calls.filter(
        (args: unknown[]) => args[2] === KAFKA_TOPICS.PAYMENT_PROCESSED,
      );
      expect(successCalls).toHaveLength(0);
    });
  });

  describe('idempotency', () => {
    it('re-queues the stored reply without calling processPayment on a duplicate command', async () => {
      idempotencyService.find.mockResolvedValue({
        replyTopic: KAFKA_TOPICS.PAYMENT_PROCESSED,
        replyPayload: { orderId: command.orderId, transactionId: 'txn-orig' },
      });

      await dispatch();

      expect(paymentsService.processPayment).not.toHaveBeenCalled();
      expect(outboxService.write).toHaveBeenCalledTimes(1);
    });
  });

  describe('unexpected errors', () => {
    it('rethrows non-payment errors so Kafka can retry', async () => {
      paymentsService.processPayment.mockRejectedValue(new Error('db connection lost'));

      await expect(dispatch()).rejects.toThrow('db connection lost');
    });
  });
});
