import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { KafkaConsumerService, KafkaEnvelope } from '@nest-gateway/kafka';
import { NotificationService } from './notification.service';
import { OrderConfirmedEvent, OrderCancelledEvent, PdfGeneratedEvent, KAFKA_TOPICS } from '@nest-gateway/shared';

@Injectable()
export class NotificationController implements OnModuleInit {
  private readonly logger = new Logger(NotificationController.name);

  constructor(
    private readonly notificationService: NotificationService,
    private readonly kafkaConsumer: KafkaConsumerService,
  ) {}

  onModuleInit(): void {
    this.kafkaConsumer.subscribe<OrderConfirmedEvent>({
      topic: KAFKA_TOPICS.ORDER_CONFIRMED,
      handler: async (e: KafkaEnvelope<OrderConfirmedEvent>) => {
        this.logger.log(`[${e.correlationId}] Received ORDER_CONFIRMED for order ${e.payload.orderId}`);
        await this.notificationService.notifyOrderConfirmed(e.payload);
      },
    });

    this.kafkaConsumer.subscribe<OrderCancelledEvent>({
      topic: KAFKA_TOPICS.ORDER_CANCELLED,
      handler: async (e: KafkaEnvelope<OrderCancelledEvent>) => {
        this.logger.log(`[${e.correlationId}] Received ORDER_CANCELLED for order ${e.payload.orderId}`);
        await this.notificationService.notifyOrderCancelled(e.payload);
      },
    });

    this.kafkaConsumer.subscribe<PdfGeneratedEvent>({
      topic: KAFKA_TOPICS.PDF_GENERATED,
      handler: async (e: KafkaEnvelope<PdfGeneratedEvent>) => {
        this.logger.log(`[${e.correlationId}] Received PDF_GENERATED for order ${e.payload.orderId}`);
        await this.notificationService.notifyPdfReady(e.payload);
      },
    });
  }
}
