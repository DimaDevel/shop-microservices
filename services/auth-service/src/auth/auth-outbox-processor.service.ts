import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { KafkaProducerService } from '@nest-gateway/kafka';
import { AbstractOutboxProcessorService } from '@nest-gateway/outbox';
import { AuthOutboxEntity } from './auth-outbox.entity';

@Injectable()
export class AuthOutboxProcessorService extends AbstractOutboxProcessorService<AuthOutboxEntity> {
  constructor(dataSource: DataSource, kafkaProducer: KafkaProducerService, config: ConfigService) {
    super(dataSource, kafkaProducer, config);
  }

  protected getEntityClass() {
    return AuthOutboxEntity;
  }
}
