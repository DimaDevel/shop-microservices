import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { UserEntity } from '../users/user.entity';
import { AuthOutboxEntity } from './auth-outbox.entity';
import { AuthOutboxService } from './auth-outbox.service';
import { AuthOutboxProcessorService } from './auth-outbox-processor.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([UserEntity, AuthOutboxEntity]),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('JWT_SECRET'),
        signOptions: { expiresIn: config.get<number>('JWT_ACCESS_EXPIRES_IN', 3600) },
      }),
      inject: [ConfigService],
    }),
  ],
  providers: [AuthService, AuthOutboxService, AuthOutboxProcessorService],
  controllers: [AuthController],
})
export class AuthModule {}
