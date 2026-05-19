import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { KafkaConsumerService, KafkaEnvelope } from '@nest-gateway/kafka';
import { PaymentsService } from './payments.service';
import { IdempotencyService } from './idempotency.service';
import { OutboxService } from './outbox.service';
import { KAFKA_TOPICS, ProcessPaymentCommand, PaymentProcessedEvent, PaymentFailedEvent } from '@nest-gateway/shared';
import { PaymentDeclinedError } from './payments.errors';

@Injectable()
export class PaymentsSagaController implements OnModuleInit {
  private readonly logger = new Logger(PaymentsSagaController.name);

  constructor(
    private readonly paymentsService: PaymentsService,
    private readonly idempotencyService: IdempotencyService,
    private readonly outboxService: OutboxService,
    private readonly dataSource: DataSource,
    private readonly kafkaConsumer: KafkaConsumerService,
  ) {}

  onModuleInit(): void {
    this.kafkaConsumer.subscribe<ProcessPaymentCommand>({
      topic: KAFKA_TOPICS.PROCESS_PAYMENT,
      handler: (e: KafkaEnvelope<ProcessPaymentCommand>) => this.handleProcessPayment(e.payload),
    });
  }

  private async handleProcessPayment(command: ProcessPaymentCommand): Promise<void> {
    this.logger.log(`[${command.correlationId}] Process-payment for order ${command.orderId}, cmdId: ${command.commandId}`);

    await this.dataSource.transaction(async (manager) => {
      // Idempotency: commandId is checked before any side-effect so Kafka at-least-once
      // redelivery or a saga retry never charges the same order twice. On a duplicate,
      // the stored reply is re-queued to the outbox so the orchestrator receives it again.
      const existing = await this.idempotencyService.find(manager, command.commandId);
      if (existing) {
        this.logger.log(`[${command.correlationId}] Duplicate payment command ${command.commandId}, re-scheduling reply`);
        await this.outboxService.write(manager, command.orderId, existing.replyTopic, command.orderId, existing.replyPayload);
        return;
      }

      try {
        const result = await this.paymentsService.processPayment(
          { orderId: command.orderId, userId: command.userId, amount: command.amount },
          manager,
        );
        const reply: PaymentProcessedEvent = {
          commandId: command.commandId,
          orderId: command.orderId,
          correlationId: command.correlationId,
          transactionId: result.transactionId,
        };
        await this.idempotencyService.save(manager, command.commandId, KAFKA_TOPICS.PAYMENT_PROCESSED, reply);
        await this.outboxService.write(manager, command.orderId, KAFKA_TOPICS.PAYMENT_PROCESSED, command.orderId, reply);
      } catch (e) {
        if (!(e instanceof PaymentDeclinedError)) throw e;
        const reply: PaymentFailedEvent = {
          commandId: command.commandId,
          orderId: command.orderId,
          correlationId: command.correlationId,
          reason: e.message,
        };
        await this.idempotencyService.save(manager, command.commandId, KAFKA_TOPICS.PAYMENT_FAILED, reply);
        await this.outboxService.write(manager, command.orderId, KAFKA_TOPICS.PAYMENT_FAILED, command.orderId, reply);
      }
    });
  }
}
