import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { KafkaProducerService } from '@nest-gateway/kafka';
import { AbstractOutboxProcessorService } from '@nest-gateway/outbox';
import { OutboxEntity } from './outbox.entity';

@Injectable()
export class OutboxProcessorService extends AbstractOutboxProcessorService<OutboxEntity> {
  constructor(dataSource: DataSource, kafkaProducer: KafkaProducerService, config: ConfigService) {
    super(dataSource, kafkaProducer, config);
  }

  protected getEntityClass() {
    return OutboxEntity;
  }
}
