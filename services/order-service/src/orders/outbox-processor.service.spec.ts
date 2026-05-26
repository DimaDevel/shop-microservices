import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { KafkaProducerService } from '@nest-gateway/kafka';
import { OutboxProcessorService } from './outbox-processor.service';
import { OUTBOX_REPOSITORY, OutboxRecord } from './domain/repositories/outbox.repository';

const makeRecord = (retryCount = 0): OutboxRecord => ({
  id: 'rec-1',
  topic: 'orders.reserve-stock',
  messageKey: 'order-1',
  payload: { correlationId: 'corr-1', orderId: 'order-1' },
  retryCount,
});

describe('OutboxProcessorService', () => {
  let service: OutboxProcessorService;
  let outboxRepo: {
    findPendingWithLock: jest.Mock;
    markPublished: jest.Mock;
    scheduleRetry: jest.Mock;
    permanentlyFail: jest.Mock;
    write: jest.Mock;
  };
  let kafkaProducer: { publish: jest.Mock };
  let dataSource: { transaction: jest.Mock };
  let fakeManager: object;

  beforeEach(async () => {
    fakeManager = {};
    outboxRepo = {
      findPendingWithLock: jest.fn(),
      markPublished: jest.fn(),
      scheduleRetry: jest.fn(),
      permanentlyFail: jest.fn(),
      write: jest.fn(),
    };
    kafkaProducer = { publish: jest.fn() };
    dataSource = {
      transaction: jest.fn().mockImplementation((cb: (m: unknown) => Promise<unknown>) => cb(fakeManager)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OutboxProcessorService,
        { provide: OUTBOX_REPOSITORY, useValue: outboxRepo },
        { provide: DataSource, useValue: dataSource },
        { provide: KafkaProducerService, useValue: kafkaProducer },
        { provide: ConfigService, useValue: { get: jest.fn().mockReturnValue(5) } },
      ],
    }).compile();

    service = module.get(OutboxProcessorService);
  });

  it('publishes pending records and marks them published', async () => {
    outboxRepo.findPendingWithLock.mockResolvedValue([makeRecord()]);
    kafkaProducer.publish.mockResolvedValue(undefined);
    outboxRepo.markPublished.mockResolvedValue(undefined);

    await service.processPending();

    expect(kafkaProducer.publish).toHaveBeenCalledTimes(1);
    expect(outboxRepo.markPublished).toHaveBeenCalledWith('rec-1', fakeManager);
    expect(outboxRepo.scheduleRetry).not.toHaveBeenCalled();
    expect(outboxRepo.permanentlyFail).not.toHaveBeenCalled();
  });

  it('schedules a retry when publish fails and retryCount + 1 < maxRetries', async () => {
    outboxRepo.findPendingWithLock.mockResolvedValue([makeRecord(0)]);
    kafkaProducer.publish.mockRejectedValue(new Error('kafka down'));
    outboxRepo.scheduleRetry.mockResolvedValue(undefined);

    await service.processPending();

    expect(outboxRepo.scheduleRetry).toHaveBeenCalledWith('rec-1', 1, 'kafka down', expect.any(Date), fakeManager);
    expect(outboxRepo.permanentlyFail).not.toHaveBeenCalled();
  });

  it('permanently fails when retryCount + 1 >= maxRetries', async () => {
    outboxRepo.findPendingWithLock.mockResolvedValue([makeRecord(4)]);
    kafkaProducer.publish.mockRejectedValue(new Error('kafka down'));
    outboxRepo.permanentlyFail.mockResolvedValue(undefined);

    await service.processPending();

    expect(outboxRepo.permanentlyFail).toHaveBeenCalledWith('rec-1', 5, 'kafka down', fakeManager);
    expect(outboxRepo.scheduleRetry).not.toHaveBeenCalled();
  });

  it('does nothing when no pending records', async () => {
    outboxRepo.findPendingWithLock.mockResolvedValue([]);

    await service.processPending();

    expect(kafkaProducer.publish).not.toHaveBeenCalled();
  });

  it('skips the run when already processing', async () => {
    (service as any).isProcessing = true;

    await service.processPending();

    expect(dataSource.transaction).not.toHaveBeenCalled();
  });

  it('logs and rethrows when transaction itself fails, then resets isProcessing', async () => {
    dataSource.transaction.mockRejectedValue(new Error('db error'));
    const loggerSpy = jest.spyOn((service as any).logger, 'error').mockImplementation(() => {});

    await expect(service.processPending()).rejects.toThrow('db error');

    expect(loggerSpy).toHaveBeenCalledWith(expect.stringContaining('db error'));
    expect((service as any).isProcessing).toBe(false);
  });
});
