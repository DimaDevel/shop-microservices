import { Controller } from '@nestjs/common';
import { EventPattern, Payload } from '@nestjs/microservices';
import { NotificationService } from './notification.service';
import { OrderCreatedEvent, PdfGeneratedEvent, KAFKA_TOPICS } from '@nest-gateway/shared';

@Controller()
export class NotificationController {
  constructor(private readonly notificationService: NotificationService) {}

  @EventPattern(KAFKA_TOPICS.ORDER_CREATED)
  handleOrderCreated(@Payload() event: OrderCreatedEvent) {
    this.notificationService.notifyOrderCreated(event);
  }

  @EventPattern(KAFKA_TOPICS.PDF_GENERATED)
  handlePdfGenerated(@Payload() event: PdfGeneratedEvent) {
    this.notificationService.notifyPdfReady(event);
  }
}
