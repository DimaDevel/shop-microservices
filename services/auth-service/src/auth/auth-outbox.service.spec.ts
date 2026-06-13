import { EntityManager } from 'typeorm';
import { AuthOutboxService } from './auth-outbox.service';
import { AuthOutboxEntity } from './auth-outbox.entity';

describe('AuthOutboxService', () => {
  let service: AuthOutboxService;
  let mockRepo: { create: jest.Mock; save: jest.Mock };
  let mockManager: { getRepository: jest.Mock };

  beforeEach(() => {
    mockRepo = {
      create: jest.fn().mockImplementation((data) => data),
      save: jest.fn().mockResolvedValue({}),
    };
    mockManager = {
      getRepository: jest.fn().mockReturnValue(mockRepo),
    };
    service = new AuthOutboxService();
  });

  it('creates and saves an outbox record via the manager', async () => {
    await service.write(mockManager as unknown as EntityManager, 'agg-1', 'users.user-registered', 'agg-1', {
      userId: 'u1',
      email: 'u@test.com',
    });

    expect(mockManager.getRepository).toHaveBeenCalledWith(AuthOutboxEntity);
    expect(mockRepo.create).toHaveBeenCalledWith({
      aggregateId: 'agg-1',
      topic: 'users.user-registered',
      messageKey: 'agg-1',
      payload: { userId: 'u1', email: 'u@test.com' },
    });
    expect(mockRepo.save).toHaveBeenCalledTimes(1);
  });

  it('propagates save errors', async () => {
    mockRepo.save.mockRejectedValue(new Error('db write failed'));

    await expect(service.write(mockManager as unknown as EntityManager, 'agg-1', 'topic', 'key', {})).rejects.toThrow(
      'db write failed',
    );
  });
});
