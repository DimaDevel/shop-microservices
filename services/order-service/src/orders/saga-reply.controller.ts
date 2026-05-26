import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { KafkaConsumerService, KafkaEnvelope } from '@nest-gateway/kafka';
import { SagaOrchestrator } from './application/services/saga-orchestrator.service';
import { OrderNotFoundError } from './domain/errors/orders.errors';
import {
  KAFKA_TOPICS,
  StockReservedEvent,
  StockReservationFailedEvent,
  StockReleasedEvent,
  PaymentProcessedEvent,
  PaymentFailedEvent,
} from '@nest-gateway/shared';

@Injectable()
export class SagaReplyController implements OnModuleInit {
  private readonly logger = new Logger(SagaReplyController.name);

  constructor(
    private readonly sagaOrchestrator: SagaOrchestrator,
    private readonly kafkaConsumer: KafkaConsumerService,
  ) {}

  onModuleInit(): void {
    this.kafkaConsumer.subscribe<StockReservedEvent>({
      topic: KAFKA_TOPICS.STOCK_RESERVED,
      handler: async (e: KafkaEnvelope<StockReservedEvent>) => {
        this.logger.log(`[${e.correlationId}] Stock reserved for order ${e.payload.orderId}`);
        await this.handle(e.correlationId, () => this.sagaOrchestrator.onStockReserved(e.payload));
      },
    });

    this.kafkaConsumer.subscribe<StockReservationFailedEvent>({
      topic: KAFKA_TOPICS.STOCK_RESERVATION_FAILED,
      handler: async (e: KafkaEnvelope<StockReservationFailedEvent>) => {
        this.logger.warn(`[${e.correlationId}] Stock reservation failed for order ${e.payload.orderId}`);
        await this.handle(e.correlationId, () => this.sagaOrchestrator.onStockReservationFailed(e.payload));
      },
    });

    this.kafkaConsumer.subscribe<PaymentProcessedEvent>({
      topic: KAFKA_TOPICS.PAYMENT_PROCESSED,
      handler: async (e: KafkaEnvelope<PaymentProcessedEvent>) => {
        this.logger.log(`[${e.correlationId}] Payment processed for order ${e.payload.orderId}`);
        await this.handle(e.correlationId, () => this.sagaOrchestrator.onPaymentProcessed(e.payload));
      },
    });

    this.kafkaConsumer.subscribe<PaymentFailedEvent>({
      topic: KAFKA_TOPICS.PAYMENT_FAILED,
      handler: async (e: KafkaEnvelope<PaymentFailedEvent>) => {
        this.logger.warn(`[${e.correlationId}] Payment failed for order ${e.payload.orderId}`);
        await this.handle(e.correlationId, () => this.sagaOrchestrator.onPaymentFailed(e.payload));
      },
    });

    this.kafkaConsumer.subscribe<StockReleasedEvent>({
      topic: KAFKA_TOPICS.STOCK_RELEASED,
      handler: async (e: KafkaEnvelope<StockReleasedEvent>) => {
        this.logger.log(`[${e.correlationId}] Stock released for order ${e.payload.orderId}`);
        await this.handle(e.correlationId, () => this.sagaOrchestrator.onStockReleased(e.payload));
      },
    });
  }

  private async handle(correlationId: string, fn: () => Promise<void>): Promise<void> {
    try {
      await fn();
    } catch (err) {
      if (err instanceof OrderNotFoundError) {
        // Order was deleted mid-saga — non-retriable, acknowledge and discard
        this.logger.warn(`[${correlationId}] ${(err as Error).message} — skipping event`);
        return;
      }
      throw err;
    }
  }
}
