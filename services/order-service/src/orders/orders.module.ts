import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OrderOrmEntity } from './infrastructure/persistence/order.orm-entity';
import { OrderItemOrmEntity } from './infrastructure/persistence/order-item.orm-entity';
import { OutboxOrmEntity } from './infrastructure/persistence/outbox.orm-entity';
import { SagaStateOrmEntity } from './infrastructure/persistence/saga-state.orm-entity';
import { TypeOrmOrderRepository } from './infrastructure/persistence/typeorm-order.repository';
import { TypeOrmSagaRepository } from './infrastructure/persistence/typeorm-saga.repository';
import { TypeOrmOutboxRepository } from './infrastructure/persistence/typeorm-outbox.repository';
import { ORDER_REPOSITORY } from './domain/repositories/order.repository';
import { SAGA_REPOSITORY } from './domain/repositories/saga.repository';
import { OUTBOX_REPOSITORY } from './domain/repositories/outbox.repository';
import { CreateOrderUseCase } from './application/use-cases/create-order.use-case';
import { GetOrderUseCase } from './application/use-cases/get-order.use-case';
import { GetUserOrdersUseCase } from './application/use-cases/get-user-orders.use-case';
import { SagaOrchestrator } from './application/services/saga-orchestrator.service';
import { OutboxProcessorService } from './outbox-processor.service';
import { OrdersController } from './orders.controller';
import { SagaReplyController } from './saga-reply.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([OrderOrmEntity, OrderItemOrmEntity, OutboxOrmEntity, SagaStateOrmEntity]),
  ],
  providers: [
    { provide: ORDER_REPOSITORY, useClass: TypeOrmOrderRepository },
    { provide: SAGA_REPOSITORY, useClass: TypeOrmSagaRepository },
    { provide: OUTBOX_REPOSITORY, useClass: TypeOrmOutboxRepository },
    CreateOrderUseCase,
    GetOrderUseCase,
    GetUserOrdersUseCase,
    SagaOrchestrator,
    OutboxProcessorService,
    SagaReplyController,
  ],
  controllers: [OrdersController],
})
export class OrdersModule {}
