import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ProxyService } from './proxy.service';
import { UsersProxyController } from './users-proxy.controller';
import { AuthProxyController } from './auth-proxy.controller';
import { ProductsProxyController } from './products-proxy.controller';
import { OrdersProxyController } from './orders-proxy.controller';
import { PaymentsProxyController } from './payments-proxy.controller';

@Module({
  imports: [AuthModule],
  providers: [ProxyService],
  controllers: [
    AuthProxyController,
    UsersProxyController,
    ProductsProxyController,
    OrdersProxyController,
    PaymentsProxyController,
  ],
  exports: [ProxyService],
})
export class ProxyModule {}
