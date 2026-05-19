import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { APP_GUARD } from '@nestjs/core';
import { KafkaModule } from '@nest-gateway/kafka';
import { ProductsModule } from './products/products.module';
import { ProductEntity } from './products/product.entity';
import { OutboxEntity } from './products/outbox.entity';
import { IdempotencyKeyEntity } from './products/idempotency.entity';
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
        database: config.get('DB_NAME', 'products_db'),
        entities: [ProductEntity, OutboxEntity, IdempotencyKeyEntity],
        synchronize: config.get('NODE_ENV') !== 'production',
        logging: config.get('NODE_ENV') !== 'production',
      }),
      inject: [ConfigService],
    }),
    KafkaModule.forRoot({
      clientId: 'product-service',
      brokers: [process.env.KAFKA_BROKERS ?? 'localhost:9092'],
      groupId: 'product-service-consumer',
      source: 'product-service',
    }),
    ProductsModule,
    HealthModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: InternalGuard }],
})
export class AppModule {}
