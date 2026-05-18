import { Injectable, Logger } from '@nestjs/common';
import { OrderCreatedEvent, PdfGeneratedEvent } from '@nest-gateway/shared';

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  notifyOrderCreated(event: OrderCreatedEvent): void {
    this.logger.log(
      `[EMAIL] To: ${event.userEmail} | Subject: Order Confirmed #${event.orderId} | ` +
      `Items: ${event.items.length} | Total: $${event.total.toFixed(2)}`,
    );
  }

  notifyPdfReady(event: PdfGeneratedEvent): void {
    this.logger.log(
      `[EMAIL] To: ${event.userEmail} | Subject: Your Order Receipt is Ready | ` +
      `Order: #${event.orderId} | PDF: ${event.pdfPath}`,
    );
  }
}
