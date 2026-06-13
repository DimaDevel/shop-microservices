import { Test, TestingModule } from '@nestjs/testing';
import { KafkaConsumerService, KafkaEnvelope } from '@nest-gateway/kafka';
import { KAFKA_TOPICS, UserRegisteredEvent } from '@nest-gateway/shared';
import { UserEventsConsumer } from './user-events.consumer';
import { UsersService } from './users.service';
import { ProfileResult } from './users.outputs';

const now = new Date();

const mockProfile: ProfileResult = {
  id: 'u-1',
  email: 'user@example.com',
  isActive: true,
  createdAt: now,
  updatedAt: now,
};

const makeEnvelope = (payload: UserRegisteredEvent): KafkaEnvelope<UserRegisteredEvent> => ({
  messageId: 'msg-1',
  correlationId: 'corr-1',
  traceparent: '',
  tracestate: '',
  timestamp: now.toISOString(),
  source: 'auth-service',
  retryCount: 0,
  payload,
});

describe('UserEventsConsumer', () => {
  let consumer: UserEventsConsumer;
  let usersService: jest.Mocked<UsersService>;
  let kafkaConsumer: jest.Mocked<KafkaConsumerService>;
  let capturedHandler: (envelope: KafkaEnvelope<UserRegisteredEvent>) => Promise<void>;

  beforeEach(async () => {
    kafkaConsumer = {
      subscribe: jest.fn().mockImplementation(({ handler }) => {
        capturedHandler = handler;
      }),
    } as unknown as jest.Mocked<KafkaConsumerService>;

    usersService = {
      createProfile: jest.fn(),
    } as unknown as jest.Mocked<UsersService>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserEventsConsumer,
        { provide: UsersService, useValue: usersService },
        { provide: KafkaConsumerService, useValue: kafkaConsumer },
      ],
    }).compile();

    consumer = module.get(UserEventsConsumer);
    consumer.onModuleInit();
  });

  afterEach(() => jest.clearAllMocks());

  describe('onModuleInit', () => {
    it('subscribes to the USER_REGISTERED topic', () => {
      expect(kafkaConsumer.subscribe).toHaveBeenCalledWith(
        expect.objectContaining({ topic: KAFKA_TOPICS.USER_REGISTERED }),
      );
    });

    it('registers a handler function', () => {
      expect(typeof capturedHandler).toBe('function');
    });
  });

  describe('handleUserRegistered', () => {
    it('calls createProfile with the userId and email from the event', async () => {
      usersService.createProfile.mockResolvedValue(mockProfile);

      await capturedHandler(makeEnvelope({ userId: 'u-1', email: 'user@example.com' }));

      expect(usersService.createProfile).toHaveBeenCalledWith('u-1', 'user@example.com');
    });

    it('propagates errors so the Kafka consumer can retry / DLQ', async () => {
      usersService.createProfile.mockRejectedValue(new Error('db unavailable'));

      await expect(capturedHandler(makeEnvelope({ userId: 'u-1', email: 'user@example.com' }))).rejects.toThrow(
        'db unavailable',
      );
    });
  });
});
