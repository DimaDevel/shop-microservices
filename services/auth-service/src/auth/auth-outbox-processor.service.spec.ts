import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { KafkaProducerService } from '@nest-gateway/kafka';
import { AuthOutboxProcessorService } from './auth-outbox-processor.service';
import { AuthOutboxEntity, OutboxStatus } from './auth-outbox.entity';

// Shared fake query-builder / repository returned by the EntityManager mock
const makeManager = () => {
  const qb = {
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    setLock: jest.fn().mockReturnThis(),
    getMany: jest.fn().mockResolvedValue([]),
  };
  const repo = { update: jest.fn().mockResolvedValue({}) };
  return {
    createQueryBuilder: jest.fn().mockReturnValue(qb),
    getRepository: jest.fn().mockReturnValue(repo),
    _qb: qb,
    _repo: repo,
  };
};

const makeRecord = (overrides: Partial<AuthOutboxEntity> = {}): AuthOutboxEntity =>
  ({
    id: 'rec-1',
    topic: 'users.user-registered',
    payload: { userId: 'u1', email: 'u@test.com' },
    retryCount: 0,
    status: OutboxStatus.PENDING,
    scheduledAt: new Date(Date.now() - 1000),
    ...overrides,
  }) as AuthOutboxEntity;

describe('AuthOutboxProcessorService', () => {
  let processor: AuthOutboxProcessorService;
  let kafkaProducer: jest.Mocked<KafkaProducerService>;
  let dataSource: jest.Mocked<DataSource>;
  let manager: ReturnType<typeof makeManager>;

  beforeEach(async () => {
    manager = makeManager();

    kafkaProducer = { publish: jest.fn().mockResolvedValue(undefined) } as any;
    dataSource = {
      transaction: jest.fn().mockImplementation(async (cb: (m: typeof manager) => Promise<void>) => cb(manager)),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthOutboxProcessorService,
        { provide: DataSource, useValue: dataSource },
        { provide: KafkaProducerService, useValue: kafkaProducer },
        {
          provide: ConfigService,
          useValue: { get: jest.fn().mockReturnValue(5) }, // maxRetries = 5
        },
      ],
    }).compile();

    processor = module.get(AuthOutboxProcessorService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('processPending', () => {
    it('does nothing when there are no pending records', async () => {
      manager._qb.getMany.mockResolvedValue([]);

      await processor.processPending();

      expect(kafkaProducer.publish).not.toHaveBeenCalled();
      expect(manager._repo.update).not.toHaveBeenCalled();
    });

    it('publishes a pending record and marks it PUBLISHED', async () => {
      const record = makeRecord();
      manager._qb.getMany.mockResolvedValue([record]);

      await processor.processPending();

      expect(kafkaProducer.publish).toHaveBeenCalledWith(
        'users.user-registered',
        record.payload,
        expect.objectContaining({ messageId: 'rec-1' }),
      );
      expect(manager.getRepository).toHaveBeenCalledWith(AuthOutboxEntity);
      expect(manager._repo.update).toHaveBeenCalledWith(
        'rec-1',
        expect.objectContaining({ status: OutboxStatus.PUBLISHED, publishedAt: expect.any(Date) }),
      );
    });

    it('schedules a retry when publish fails and retryCount is below maxRetries', async () => {
      const record = makeRecord({ retryCount: 1 }); // next attempt = 2, maxRetries = 5
      manager._qb.getMany.mockResolvedValue([record]);
      kafkaProducer.publish.mockRejectedValue(new Error('kafka down'));

      await processor.processPending();

      expect(manager._repo.update).toHaveBeenCalledWith(
        'rec-1',
        expect.objectContaining({
          status: OutboxStatus.PENDING,
          retryCount: 2,
          lastError: 'kafka down',
          scheduledAt: expect.any(Date),
        }),
      );
    });

    it('permanently fails a record when retryCount reaches maxRetries', async () => {
      const record = makeRecord({ retryCount: 4 }); // next attempt = 5 = maxRetries
      manager._qb.getMany.mockResolvedValue([record]);
      kafkaProducer.publish.mockRejectedValue(new Error('kafka down'));

      await processor.processPending();

      expect(manager._repo.update).toHaveBeenCalledWith(
        'rec-1',
        expect.objectContaining({
          status: OutboxStatus.FAILED,
          retryCount: 5,
          lastError: 'kafka down',
        }),
      );
    });

    it('continues processing subsequent records after one fails', async () => {
      const r1 = makeRecord({ id: 'rec-1' });
      const r2 = makeRecord({ id: 'rec-2', payload: { userId: 'u2', email: 'b@test.com' } });
      manager._qb.getMany.mockResolvedValue([r1, r2]);
      kafkaProducer.publish.mockRejectedValueOnce(new Error('transient')).mockResolvedValueOnce(undefined);

      await processor.processPending();

      // r1 failed → scheduled retry; r2 succeeded → published
      expect(kafkaProducer.publish).toHaveBeenCalledTimes(2);
      const updateCalls = manager._repo.update.mock.calls;
      expect(updateCalls[0][1]).toMatchObject({ status: OutboxStatus.PENDING });
      expect(updateCalls[1][1]).toMatchObject({ status: OutboxStatus.PUBLISHED });
    });

    it('skips execution when already processing (concurrency guard)', async () => {
      // Simulate slow transaction that has not yet resolved
      let resolveTransaction!: (value?: unknown) => void;
      (dataSource.transaction as jest.Mock).mockReturnValueOnce(
        new Promise((resolve) => {
          resolveTransaction = resolve;
        }),
      );

      const first = processor.processPending();
      // Second call fires before first has finished
      await processor.processPending();

      expect(dataSource.transaction).toHaveBeenCalledTimes(1);
      resolveTransaction();
      await first;
    });

    it('catches and logs errors from the transaction itself without crashing', async () => {
      (dataSource.transaction as jest.Mock).mockRejectedValue(new Error('connection lost'));

      await expect(processor.processPending()).resolves.toBeUndefined();
      expect(kafkaProducer.publish).not.toHaveBeenCalled();
    });
  });
});
