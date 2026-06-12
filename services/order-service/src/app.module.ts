import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { APP_GUARD } from '@nestjs/core';
import { KafkaModule, DbKafkaHealthModule } from '@nest-gateway/kafka';
import { OrdersModule } from './orders/orders.module';
import { OrderOrmEntity } from './orders/infrastructure/persistence/order.orm-entity';
import { OrderItemOrmEntity } from './orders/infrastructure/persistence/order-item.orm-entity';
import { OutboxOrmEntity } from './orders/infrastructure/persistence/outbox.orm-entity';
import { SagaStateOrmEntity } from './orders/infrastructure/persistence/saga-state.orm-entity';
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
        entities: [OrderOrmEntity, OrderItemOrmEntity, OutboxOrmEntity, SagaStateOrmEntity],
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
    DbKafkaHealthModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: InternalGuard }],
})
export class AppModule {}
