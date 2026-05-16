import { Module } from '@nestjs/common';
import { ProxyService } from './proxy.service';
import { UsersProxyController } from './users-proxy.controller';
import { AuthProxyController } from './auth-proxy.controller';

@Module({
  providers: [ProxyService],
  controllers: [AuthProxyController, UsersProxyController],
  exports: [ProxyService],
})
export class ProxyModule {}
