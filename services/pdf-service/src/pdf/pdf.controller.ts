import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { KafkaConsumerService, KafkaEnvelope } from '@nest-gateway/kafka';
import { PdfService } from './pdf.service';
import { OrderConfirmedEvent, KAFKA_TOPICS } from '@nest-gateway/shared';

@Injectable()
export class PdfController implements OnModuleInit {
  private readonly logger = new Logger(PdfController.name);

  constructor(
    private readonly pdfService: PdfService,
    private readonly kafkaConsumer: KafkaConsumerService,
  ) {}

  onModuleInit(): void {
    this.kafkaConsumer.subscribe<OrderConfirmedEvent>({
      topic: KAFKA_TOPICS.ORDER_CONFIRMED,
      handler: async (e: KafkaEnvelope<OrderConfirmedEvent>) => {
        this.logger.log(`[${e.correlationId}] Received ORDER_CONFIRMED for order ${e.payload.orderId}`);
        await this.pdfService.generateOrderPdf(e.payload);
      },
    });
  }
}
