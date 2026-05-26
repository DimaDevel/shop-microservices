import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PaymentEntity } from './payment.entity';
import { OutboxEntity } from './outbox.entity';
import { IdempotencyKeyEntity } from './idempotency.entity';
import { PaymentsService } from './payments.service';
import { IdempotencyService } from './idempotency.service';
import { OutboxService } from './outbox.service';
import { OutboxProcessorService } from './outbox-processor.service';
import { PaymentsSagaController } from './payments-saga.controller';

@Module({
  imports: [TypeOrmModule.forFeature([PaymentEntity, OutboxEntity, IdempotencyKeyEntity])],
  providers: [PaymentsService, IdempotencyService, OutboxService, OutboxProcessorService, PaymentsSagaController],
})
export class PaymentsModule {}
