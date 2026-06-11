import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { KafkaConsumerService, KafkaEnvelope } from '@nest-gateway/kafka';
import { KAFKA_TOPICS, UserRegisteredEvent } from '@nest-gateway/shared';
import { WalletService } from './wallet.service';

@Injectable()
export class WalletEventsConsumer implements OnModuleInit {
  private readonly logger = new Logger(WalletEventsConsumer.name);
  private readonly initialBalance: number;

  constructor(
    private readonly walletService: WalletService,
    private readonly dataSource: DataSource,
    private readonly kafkaConsumer: KafkaConsumerService,
    private readonly config: ConfigService,
  ) {
    this.initialBalance = config.get<number>('WALLET_INITIAL_BALANCE', 10_000);
  }

  onModuleInit(): void {
    this.kafkaConsumer.subscribe<UserRegisteredEvent>({
      topic: KAFKA_TOPICS.USER_REGISTERED,
      handler: (e: KafkaEnvelope<UserRegisteredEvent>) => this.handleUserRegistered(e.payload),
    });
  }

  private async handleUserRegistered(event: UserRegisteredEvent): Promise<void> {
    this.logger.log(`Creating wallet for user ${event.userId} with balance ${this.initialBalance}`);
    await this.dataSource.transaction(async (manager) => {
      await this.walletService.findOrCreate(event.userId, this.initialBalance, manager);
    });
  }
}
