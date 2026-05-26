import { TypeOrmOutboxRepository } from './typeorm-outbox.repository';
import { OutboxStatus } from './outbox.orm-entity';

interface FakeManager {
  createQueryBuilder: jest.Mock;
  getRepository: jest.Mock;
  _qb: {
    where: jest.Mock;
    andWhere: jest.Mock;
    orderBy: jest.Mock;
    limit: jest.Mock;
    setLock: jest.Mock;
    getMany: jest.Mock;
  };
  _repo: { save: jest.Mock; create: jest.Mock; update: jest.Mock };
}

const makeManager = (): FakeManager => {
  const mockQb = {
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    setLock: jest.fn().mockReturnThis(),
    getMany: jest.fn(),
  };
  const mockRepo = {
    save: jest.fn(),
    create: jest.fn().mockImplementation((d) => d),
    update: jest.fn(),
  };
  return {
    createQueryBuilder: jest.fn().mockReturnValue(mockQb),
    getRepository: jest.fn().mockReturnValue(mockRepo),
    _qb: mockQb,
    _repo: mockRepo,
  };
};

describe('TypeOrmOutboxRepository', () => {
  let repo: TypeOrmOutboxRepository;
  let manager: ReturnType<typeof makeManager>;

  beforeEach(() => {
    repo = new TypeOrmOutboxRepository();
    manager = makeManager();
  });

  describe('write', () => {
    it('creates and saves an outbox entity via the manager', async () => {
      manager._repo.save.mockResolvedValue({});

      await repo.write('agg-1', 'topic-a', 'key-1', { data: 1 }, manager as any);

      expect(manager.getRepository).toHaveBeenCalled();
      expect(manager._repo.create).toHaveBeenCalledWith({
        aggregateId: 'agg-1',
        topic: 'topic-a',
        messageKey: 'key-1',
        payload: { data: 1 },
      });
      expect(manager._repo.save).toHaveBeenCalledTimes(1);
    });
  });

  describe('findPendingWithLock', () => {
    it('returns mapped OutboxRecord array', async () => {
      manager._qb.getMany.mockResolvedValue([
        { id: 'r-1', topic: 'topic-a', messageKey: 'key-1', payload: {}, retryCount: 0 },
      ]);

      const records = await repo.findPendingWithLock(10, manager as any);

      expect(manager.createQueryBuilder).toHaveBeenCalled();
      expect(manager._qb.setLock).toHaveBeenCalledWith('pessimistic_partial_write');
      expect(manager._qb.limit).toHaveBeenCalledWith(10);
      expect(records).toHaveLength(1);
      expect(records[0].id).toBe('r-1');
    });
  });

  describe('markPublished', () => {
    it('sets status to PUBLISHED and publishedAt', async () => {
      manager._repo.update.mockResolvedValue({});

      await repo.markPublished('rec-1', manager as any);

      expect(manager._repo.update).toHaveBeenCalledWith(
        'rec-1',
        expect.objectContaining({
          status: OutboxStatus.PUBLISHED,
          publishedAt: expect.any(Date),
        }),
      );
    });
  });

  describe('scheduleRetry', () => {
    it('sets status to PENDING with new retryCount and scheduledAt', async () => {
      manager._repo.update.mockResolvedValue({});
      const scheduled = new Date(Date.now() + 2000);

      await repo.scheduleRetry('rec-1', 2, 'timeout', scheduled, manager as any);

      expect(manager._repo.update).toHaveBeenCalledWith('rec-1', {
        status: OutboxStatus.PENDING,
        retryCount: 2,
        lastError: 'timeout',
        scheduledAt: scheduled,
      });
    });
  });

  describe('permanentlyFail', () => {
    it('sets status to FAILED with retryCount and error', async () => {
      manager._repo.update.mockResolvedValue({});

      await repo.permanentlyFail('rec-1', 5, 'kafka unreachable', manager as any);

      expect(manager._repo.update).toHaveBeenCalledWith('rec-1', {
        status: OutboxStatus.FAILED,
        retryCount: 5,
        lastError: 'kafka unreachable',
      });
    });
  });
});
