import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OrderEntity } from './order.entity';
import { OrderItemEntity } from './order-item.entity';
import { OutboxEntity } from './outbox.entity';
import { SagaStateEntity } from './saga-state.entity';
import { OrdersService } from './orders.service';
import { SagaService } from './saga.service';
import { OutboxService } from './outbox.service';
import { OutboxProcessorService } from './outbox-processor.service';
import { OrdersController } from './orders.controller';
import { SagaReplyController } from './saga-reply.controller';

@Module({
  imports: [TypeOrmModule.forFeature([OrderEntity, OrderItemEntity, OutboxEntity, SagaStateEntity])],
  providers: [OrdersService, SagaService, OutboxService, OutboxProcessorService, SagaReplyController],
  controllers: [OrdersController],
})
export class OrdersModule {}
