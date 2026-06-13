import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { KafkaConsumerService, KafkaEnvelope } from '@nest-gateway/kafka';
import { KAFKA_TOPICS } from '@nest-gateway/shared';
import { WalletEventsConsumer } from './wallet-events.consumer';
import { WalletService } from './wallet.service';

describe('WalletEventsConsumer', () => {
  let consumer: WalletEventsConsumer;
  let walletService: { findOrCreate: jest.Mock };
  let dataSource: { transaction: jest.Mock };
  let kafkaConsumer: { subscribe: jest.Mock };
  const handlers = new Map<string, (e: KafkaEnvelope<unknown>) => Promise<void>>();

  beforeEach(async () => {
    handlers.clear();
    walletService = { findOrCreate: jest.fn().mockResolvedValue({}) };
    dataSource = {
      transaction: jest.fn().mockImplementation((cb: (manager: unknown) => Promise<unknown>) => cb({})),
    };
    kafkaConsumer = {
      subscribe: jest.fn().mockImplementation(({ topic, handler }) => handlers.set(topic, handler)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WalletEventsConsumer,
        { provide: WalletService, useValue: walletService },
        { provide: DataSource, useValue: dataSource },
        { provide: KafkaConsumerService, useValue: kafkaConsumer },
        {
          provide: ConfigService,
          useValue: { get: jest.fn().mockImplementation((key: string, def: unknown) => def) },
        },
      ],
    }).compile();

    consumer = module.get(WalletEventsConsumer);
    consumer.onModuleInit();
  });

  afterEach(() => jest.clearAllMocks());

  it('subscribes to USER_REGISTERED on init', () => {
    expect(kafkaConsumer.subscribe).toHaveBeenCalledWith(
      expect.objectContaining({ topic: KAFKA_TOPICS.USER_REGISTERED }),
    );
  });

  it('creates a wallet inside a transaction when a user registers', async () => {
    await handlers.get(KAFKA_TOPICS.USER_REGISTERED)!({
      payload: { userId: 'user-1', email: 'user@example.com' },
    });

    expect(dataSource.transaction).toHaveBeenCalledTimes(1);
    expect(walletService.findOrCreate).toHaveBeenCalledWith('user-1', expect.any(Number), {});
  });

  it('seeds the wallet with WALLET_INITIAL_BALANCE default of 10 000', async () => {
    await handlers.get(KAFKA_TOPICS.USER_REGISTERED)!({
      payload: { userId: 'user-2', email: 'u@example.com' },
    });

    expect(walletService.findOrCreate).toHaveBeenCalledWith('user-2', 10_000, expect.anything());
  });

  it('uses a custom initial balance from config when set', async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WalletEventsConsumer,
        { provide: WalletService, useValue: walletService },
        { provide: DataSource, useValue: dataSource },
        { provide: KafkaConsumerService, useValue: kafkaConsumer },
        {
          provide: ConfigService,
          useValue: { get: jest.fn().mockReturnValue(500) },
        },
      ],
    }).compile();

    const customConsumer = module.get(WalletEventsConsumer);
    customConsumer.onModuleInit();

    await handlers.get(KAFKA_TOPICS.USER_REGISTERED)!({
      payload: { userId: 'user-3', email: 'u@example.com' },
    });

    expect(walletService.findOrCreate).toHaveBeenCalledWith('user-3', 500, expect.anything());
  });
});
