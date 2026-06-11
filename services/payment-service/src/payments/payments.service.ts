import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { randomUUID } from 'crypto';
import { PaymentEntity, PaymentStatus } from './payment.entity';
import { WalletService } from './wallet.service';

export interface ProcessPaymentInput {
  orderId: string;
  userId: string;
  amount: number;
}

export interface ProcessPaymentResult {
  transactionId: string;
}

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    @InjectRepository(PaymentEntity)
    private readonly paymentsRepo: Repository<PaymentEntity>,
    private readonly walletService: WalletService,
  ) {}

  async processPayment(input: ProcessPaymentInput, manager: EntityManager): Promise<ProcessPaymentResult> {
    const paymentRepository = manager.getRepository(PaymentEntity);

    const payment = await paymentRepository.save(
      paymentRepository.create({
        orderId: input.orderId,
        userId: input.userId,
        amount: input.amount,
        status: PaymentStatus.PENDING,
      }),
    );

    // Deduct from wallet — throws InsufficientFundsError if balance is too low.
    // The SELECT FOR UPDATE inside walletService.deduct prevents concurrent double-spending.
    await this.walletService.deduct(input.userId, input.amount, manager);

    const transactionId = `txn-${randomUUID()}`;
    await paymentRepository.update(payment.id, { status: PaymentStatus.COMPLETED, transactionId });

    this.logger.log(`Payment ${transactionId} completed for order ${input.orderId}, amount: ${input.amount}`);
    return { transactionId };
  }
}
