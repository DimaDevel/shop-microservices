import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProductEntity } from './product.entity';
import { OutboxEntity } from './outbox.entity';
import { IdempotencyKeyEntity } from './idempotency.entity';
import { ProductsService } from './products.service';
import { IdempotencyService } from './idempotency.service';
import { OutboxService } from './outbox.service';
import { OutboxProcessorService } from './outbox-processor.service';
import { ProductsController } from './products.controller';
import { ProductsSagaController } from './products-saga.controller';

@Module({
  imports: [TypeOrmModule.forFeature([ProductEntity, OutboxEntity, IdempotencyKeyEntity])],
  providers: [ProductsService, IdempotencyService, OutboxService, OutboxProcessorService, ProductsSagaController],
  controllers: [ProductsController],
})
export class ProductsModule {}
