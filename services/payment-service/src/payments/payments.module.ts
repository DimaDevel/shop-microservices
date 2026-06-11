import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PaymentEntity } from './payment.entity';
import { OutboxEntity } from './outbox.entity';
import { IdempotencyKeyEntity } from './idempotency.entity';
import { UserWalletEntity } from './user-wallet.entity';
import { PaymentsService } from './payments.service';
import { WalletService } from './wallet.service';
import { IdempotencyService } from './idempotency.service';
import { OutboxService } from './outbox.service';
import { OutboxProcessorService } from './outbox-processor.service';
import { PaymentsSagaController } from './payments-saga.controller';
import { WalletEventsConsumer } from './wallet-events.consumer';
import { WalletsController } from './wallets.controller';

@Module({
  imports: [TypeOrmModule.forFeature([PaymentEntity, OutboxEntity, IdempotencyKeyEntity, UserWalletEntity])],
  providers: [
    PaymentsService,
    WalletService,
    IdempotencyService,
    OutboxService,
    OutboxProcessorService,
    PaymentsSagaController,
    WalletEventsConsumer,
  ],
  controllers: [WalletsController],
})
export class PaymentsModule {}
