import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { APP_GUARD } from '@nestjs/core';
import { KafkaModule, DbKafkaHealthModule } from '@nest-gateway/kafka';
import { PaymentsModule } from './payments/payments.module';
import { PaymentEntity } from './payments/payment.entity';
import { OutboxEntity } from './payments/outbox.entity';
import { IdempotencyKeyEntity } from './payments/idempotency.entity';
import { UserWalletEntity } from './payments/user-wallet.entity';
import { InternalGuard } from './guards/internal.guard';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        host: config.get('DB_HOST', 'localhost'),
        port: config.get<number>('DB_PORT', 5432),
        username: config.get('DB_USER', 'postgres'),
        password: config.get('DB_PASSWORD', 'postgres'),
        database: config.get('DB_NAME', 'payments_db'),
        entities: [PaymentEntity, OutboxEntity, IdempotencyKeyEntity, UserWalletEntity],
        synchronize: config.get('NODE_ENV') !== 'production',
        logging: config.get('NODE_ENV') !== 'production',
      }),
      inject: [ConfigService],
    }),
    KafkaModule.forRoot({
      clientId: 'payment-service',
      brokers: [process.env.KAFKA_BROKERS ?? 'localhost:9092'],
      groupId: 'payment-service-consumer',
      source: 'payment-service',
    }),
    PaymentsModule,
    DbKafkaHealthModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: InternalGuard }],
})
export class AppModule {}
