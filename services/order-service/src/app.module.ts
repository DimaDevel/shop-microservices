import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { APP_GUARD } from '@nestjs/core';
import { KafkaModule } from '@nest-gateway/kafka';
import { OrdersModule } from './orders/orders.module';
import { OrderEntity } from './orders/order.entity';
import { OrderItemEntity } from './orders/order-item.entity';
import { OutboxEntity } from './orders/outbox.entity';
import { SagaStateEntity } from './orders/saga-state.entity';
import { HealthModule } from './health/health.module';
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
        database: config.get('DB_NAME', 'orders_db'),
        entities: [OrderEntity, OrderItemEntity, OutboxEntity, SagaStateEntity],
        synchronize: config.get('NODE_ENV') !== 'production',
        logging: config.get('NODE_ENV') !== 'production',
      }),
      inject: [ConfigService],
    }),
    KafkaModule.forRoot({
      clientId: 'order-service',
      brokers: [process.env.KAFKA_BROKERS ?? 'localhost:9092'],
      groupId: 'order-service-consumer',
      source: 'order-service',
    }),
    OrdersModule,
    HealthModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: InternalGuard }],
})
export class AppModule {}
