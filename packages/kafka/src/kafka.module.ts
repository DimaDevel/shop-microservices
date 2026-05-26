import { DynamicModule, Module } from '@nestjs/common';
import { Kafka } from 'kafkajs';
import { KafkaModuleOptions } from './kafka.options';
import { KafkaProducerService } from './kafka.producer.service';
import { KafkaConsumerService } from './kafka.consumer.service';
import { KafkaHealthIndicator } from './kafka-health.indicator';

@Module({})
export class KafkaModule {
  static forRoot(options: KafkaModuleOptions): DynamicModule {
    const kafka = new Kafka({ clientId: options.clientId, brokers: options.brokers });

    return {
      module: KafkaModule,
      global: true,
      providers: [
        { provide: 'KAFKA_INSTANCE', useValue: kafka },
        { provide: 'KAFKA_MODULE_OPTIONS', useValue: options },
        {
          provide: KafkaProducerService,
          useFactory: (k: Kafka, o: KafkaModuleOptions) => new KafkaProducerService(k, o),
          inject: ['KAFKA_INSTANCE', 'KAFKA_MODULE_OPTIONS'],
        },
        {
          provide: KafkaConsumerService,
          useFactory: (k: Kafka, p: KafkaProducerService, o: KafkaModuleOptions) => new KafkaConsumerService(k, p, o),
          inject: ['KAFKA_INSTANCE', KafkaProducerService, 'KAFKA_MODULE_OPTIONS'],
        },
        KafkaHealthIndicator,
      ],
      exports: [KafkaProducerService, KafkaConsumerService, KafkaHealthIndicator],
    };
  }
}
