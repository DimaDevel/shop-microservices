import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { CacheModule } from '@nestjs/cache-manager';
import KeyvRedis from '@keyv/redis';
import Keyv from 'keyv';
import { JwtStrategy } from './jwt.strategy';

@Module({
  imports: [
    PassportModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('JWT_SECRET'),
        signOptions: { expiresIn: '1h' },
      }),
      inject: [ConfigService],
    }),
    CacheModule.registerAsync({
      isGlobal: true,
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => ({
        stores: [
          new Keyv({
            store: new KeyvRedis(`redis://${config.get('REDIS_HOST', 'localhost')}:${config.get('REDIS_PORT', 6379)}`),
            namespace: 'gw',
          }),
        ],
      }),
      inject: [ConfigService],
    }),
  ],
  providers: [JwtStrategy],
  exports: [JwtModule],
})
export class AuthModule {}
