import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { KafkaConsumerService, KafkaEnvelope } from '@nest-gateway/kafka';
import { SagaService } from './saga.service';
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
    private readonly sagaService: SagaService,
    private readonly kafkaConsumer: KafkaConsumerService,
  ) {}

  onModuleInit(): void {
    // Idempotency for all reply handlers is enforced by SagaService: each handler
    // checks saga.currentStep before acting, so a replayed Kafka event that arrives
    // after the saga has already advanced is silently dropped.
    this.kafkaConsumer.subscribe<StockReservedEvent>({
      topic: KAFKA_TOPICS.STOCK_RESERVED,
      handler: async (e: KafkaEnvelope<StockReservedEvent>) => {
        this.logger.log(`[${e.correlationId}] Stock reserved for order ${e.payload.orderId}`);
        await this.sagaService.onStockReserved(e.payload);
      },
    });

    this.kafkaConsumer.subscribe<StockReservationFailedEvent>({
      topic: KAFKA_TOPICS.STOCK_RESERVATION_FAILED,
      handler: async (e: KafkaEnvelope<StockReservationFailedEvent>) => {
        this.logger.warn(`[${e.correlationId}] Stock reservation failed for order ${e.payload.orderId}`);
        await this.sagaService.onStockReservationFailed(e.payload);
      },
    });

    this.kafkaConsumer.subscribe<PaymentProcessedEvent>({
      topic: KAFKA_TOPICS.PAYMENT_PROCESSED,
      handler: async (e: KafkaEnvelope<PaymentProcessedEvent>) => {
        this.logger.log(`[${e.correlationId}] Payment processed for order ${e.payload.orderId}`);
        await this.sagaService.onPaymentProcessed(e.payload);
      },
    });

    this.kafkaConsumer.subscribe<PaymentFailedEvent>({
      topic: KAFKA_TOPICS.PAYMENT_FAILED,
      handler: async (e: KafkaEnvelope<PaymentFailedEvent>) => {
        this.logger.warn(`[${e.correlationId}] Payment failed for order ${e.payload.orderId}`);
        await this.sagaService.onPaymentFailed(e.payload);
      },
    });

    this.kafkaConsumer.subscribe<StockReleasedEvent>({
      topic: KAFKA_TOPICS.STOCK_RELEASED,
      handler: async (e: KafkaEnvelope<StockReleasedEvent>) => {
        this.logger.log(`[${e.correlationId}] Stock released for order ${e.payload.orderId}`);
        await this.sagaService.onStockReleased(e.payload);
      },
    });
  }
}
