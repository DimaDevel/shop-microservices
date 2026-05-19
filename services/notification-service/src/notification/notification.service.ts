import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OrderConfirmedEvent, OrderCancelledEvent, PdfGeneratedEvent, KAFKA_TOPICS } from '@nest-gateway/shared';
import { NotificationLogEntity } from './notification-log.entity';

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  constructor(
    @InjectRepository(NotificationLogEntity)
    private readonly logRepo: Repository<NotificationLogEntity>,
  ) {}

  async notifyOrderConfirmed(event: OrderConfirmedEvent): Promise<void> {
    if (!(await this.markSent(event.orderId, KAFKA_TOPICS.ORDER_CONFIRMED, event.correlationId))) return;
    this.logger.log(
      `[${event.correlationId}] [EMAIL] To: ${event.userEmail} | Subject: Order Confirmed #${event.orderId} | ` +
      `Items: ${event.items.length} | Total: $${event.total.toFixed(2)}`,
    );
  }

  async notifyOrderCancelled(event: OrderCancelledEvent): Promise<void> {
    if (!(await this.markSent(event.orderId, KAFKA_TOPICS.ORDER_CANCELLED, event.correlationId))) return;
    this.logger.log(
      `[${event.correlationId}] [EMAIL] To: ${event.userEmail} | Subject: Order Cancelled #${event.orderId} | ` +
      `Reason: ${event.reason}`,
    );
  }

  async notifyPdfReady(event: PdfGeneratedEvent): Promise<void> {
    if (!(await this.markSent(event.orderId, KAFKA_TOPICS.PDF_GENERATED, event.correlationId))) return;
    this.logger.log(
      `[${event.correlationId}] [EMAIL] To: ${event.userEmail} | Subject: Your Order Receipt is Ready | ` +
      `Order: #${event.orderId} | PDF: ${event.pdfPath}`,
    );
  }

  // Returns true if this is the first time; false if already processed (unique violation).
  private async markSent(orderId: string, eventType: string, correlationId: string): Promise<boolean> {
    try {
      await this.logRepo.insert({ orderId, eventType, correlationId });
      return true;
    } catch (e: any) {
      if (e?.code === '23505') {
        this.logger.warn(`[${correlationId}] Duplicate ${eventType} for order ${orderId}, skipping`);
        return false;
      }
      throw e;
    }
  }
}
