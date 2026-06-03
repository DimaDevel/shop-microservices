import { Injectable, Logger } from '@nestjs/common';
import { KafkaProducerService } from '@nest-gateway/kafka';
import * as fs from 'fs';
import * as path from 'path';
import * as PDFDocument from 'pdfkit';
import { OrderConfirmedEvent, PdfGeneratedEvent, KAFKA_TOPICS } from '@nest-gateway/shared';

@Injectable()
export class PdfService {
  private readonly logger = new Logger(PdfService.name);
  private readonly pdfDir = process.env.PDF_OUTPUT_DIR ?? path.join(process.cwd(), 'pdfs');

  constructor(private readonly kafkaProducer: KafkaProducerService) {
    fs.mkdirSync(this.pdfDir, { recursive: true });
  }

  async generateOrderPdf(event: OrderConfirmedEvent): Promise<void> {
    const pdfPath = path.join(this.pdfDir, `order-${event.orderId}.pdf`);

    if (fs.existsSync(pdfPath)) {
      this.logger.warn(`[${event.correlationId}] PDF already exists for order ${event.orderId}, re-emitting event`);
    } else {
      this.logger.log(`[${event.correlationId}] Generating PDF for order ${event.orderId}`);
      await this.writePdf(pdfPath, event);
      this.logger.log(`[${event.correlationId}] PDF generated: ${pdfPath}`);
    }

    const pdfEvent: PdfGeneratedEvent = {
      orderId: event.orderId,
      userId: event.userId,
      userEmail: event.userEmail,
      correlationId: event.correlationId,
      pdfPath,
      createdAt: new Date().toISOString(),
    };

    await this.kafkaProducer.publish(KAFKA_TOPICS.PDF_GENERATED, pdfEvent, {
      correlationId: event.correlationId,
    });
  }

  private writePdf(filePath: string, event: OrderConfirmedEvent): Promise<void> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ margin: 50 });
      const stream = fs.createWriteStream(filePath);
      doc.pipe(stream);
      doc.fontSize(20).text('Order Receipt', { align: 'center' });
      doc.moveDown();
      doc.fontSize(12).text(`Order ID: ${event.orderId}`);
      doc.text(`Customer: ${event.userEmail}`);
      doc.text(`Date: ${new Date(event.confirmedAt).toLocaleDateString()}`);
      doc.moveDown();
      doc.fontSize(14).text('Items:', { underline: true });
      doc.moveDown(0.5);
      for (const item of event.items) {
        const lineTotal = (item.unitPrice * item.quantity).toFixed(2);
        doc.fontSize(11).text(`${item.name}  x${item.quantity}  @ $${item.unitPrice.toFixed(2)}  =  $${lineTotal}`);
      }
      doc.moveDown();
      doc.fontSize(14).text(`Total: $${event.total.toFixed(2)}`, { align: 'right' });
      doc.end();
      stream.on('finish', resolve);
      stream.on('error', reject);
    });
  }
}
