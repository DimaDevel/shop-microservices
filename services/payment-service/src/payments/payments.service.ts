import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { randomUUID } from 'crypto';
import { PaymentEntity, PaymentStatus } from './payment.entity';
import { PaymentDeclinedError } from './payments.errors';

export interface ProcessPaymentInput {
  orderId: string;
  userId: string;
  amount: number;
}

export interface ProcessPaymentResult {
  transactionId: string;
}

// Simulates a payment gateway. Replace with a real provider integration.
@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    @InjectRepository(PaymentEntity)
    private readonly paymentsRepo: Repository<PaymentEntity>,
  ) {}

  async processPayment(
    input: ProcessPaymentInput,
    manager: EntityManager,
  ): Promise<ProcessPaymentResult> {
    const paymentRepository = manager.getRepository(PaymentEntity);

    const payment = await paymentRepository.save(
      paymentRepository.create({
        orderId: input.orderId,
        userId: input.userId,
        amount: input.amount,
        status: PaymentStatus.PENDING,
      }),
    );

    // Mock payment gateway: succeed for amounts under 10000, fail otherwise.
    const success = input.amount < 10_000;

    if (!success) {
      await paymentRepository.update(payment.id, {
        status: PaymentStatus.FAILED,
        failureReason: 'Payment declined by gateway (amount exceeds limit)',
      });
      throw new PaymentDeclinedError('Payment declined by gateway (amount exceeds limit)');
    }

    const transactionId = `txn-${randomUUID()}`;
    await paymentRepository.update(payment.id, { status: PaymentStatus.COMPLETED, transactionId });

    this.logger.log(`Payment ${transactionId} completed for order ${input.orderId}, amount: ${input.amount}`);
    return { transactionId };
  }
}
