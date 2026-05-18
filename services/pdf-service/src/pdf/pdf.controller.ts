import { Controller } from '@nestjs/common';
import { EventPattern, Payload } from '@nestjs/microservices';
import { PdfService } from './pdf.service';
import { OrderCreatedEvent, KAFKA_TOPICS } from '@nest-gateway/shared';

@Controller()
export class PdfController {
  constructor(private readonly pdfService: PdfService) {}

  @EventPattern(KAFKA_TOPICS.ORDER_CREATED)
  async handleOrderCreated(@Payload() event: OrderCreatedEvent) {
    await this.pdfService.generateOrderPdf(event);
  }
}
