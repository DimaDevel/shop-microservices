import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { KafkaConsumerService, KafkaEnvelope } from '@nest-gateway/kafka';
import { KAFKA_TOPICS, UserRegisteredEvent } from '@nest-gateway/shared';
import { UsersService } from './users.service';

@Injectable()
export class UserEventsConsumer implements OnModuleInit {
  private readonly logger = new Logger(UserEventsConsumer.name);

  constructor(
    private readonly usersService: UsersService,
    private readonly kafkaConsumer: KafkaConsumerService,
  ) {}

  onModuleInit(): void {
    this.kafkaConsumer.subscribe<UserRegisteredEvent>({
      topic: KAFKA_TOPICS.USER_REGISTERED,
      handler: (e: KafkaEnvelope<UserRegisteredEvent>) => this.handleUserRegistered(e.payload),
    });
  }

  private async handleUserRegistered(event: UserRegisteredEvent): Promise<void> {
    this.logger.log(`Creating profile for user ${event.userId}`);
    await this.usersService.createProfile(event.userId, event.email);
  }
}
