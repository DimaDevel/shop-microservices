import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { KafkaModule } from '@nest-gateway/kafka';
import { NotificationModule } from './notification/notification.module';
import { HealthModule } from './health/health.module';
import { NotificationLogEntity } from './notification/notification-log.entity';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        host: config.getOrThrow('DB_HOST'),
        port: config.get<number>('DB_PORT', 5432),
        username: config.getOrThrow('DB_USER'),
        password: config.getOrThrow('DB_PASSWORD'),
        database: config.getOrThrow('DB_NAME'),
        entities: [NotificationLogEntity],
        synchronize: true,
      }),
    }),
    KafkaModule.forRoot({
      clientId: 'notification-service',
      brokers: [process.env.KAFKA_BROKERS ?? 'localhost:9092'],
      groupId: 'notification-service-consumer',
      source: 'notification-service',
    }),
    NotificationModule,
    HealthModule,
  ],
})
export class AppModule {}
