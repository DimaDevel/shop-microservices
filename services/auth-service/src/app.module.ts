import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { APP_GUARD } from '@nestjs/core';
import { KafkaModule, DbHealthModule } from '@nest-gateway/kafka';
import { AuthModule } from './auth/auth.module';
import { UserEntity } from './users/user.entity';
import { AuthOutboxEntity } from './auth/auth-outbox.entity';
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
        database: config.get('DB_NAME', 'auth_db'),
        entities: [UserEntity, AuthOutboxEntity],
        synchronize: config.get('NODE_ENV') !== 'production',
        logging: config.get('NODE_ENV') !== 'production',
      }),
      inject: [ConfigService],
    }),
    KafkaModule.forRoot({
      clientId: 'auth-service',
      brokers: [process.env.KAFKA_BROKERS ?? 'localhost:9092'],
      groupId: 'auth-service-consumer',
      source: 'auth-service',
    }),
    AuthModule,
    DbHealthModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: InternalGuard,
    },
  ],
})
export class AppModule {}
