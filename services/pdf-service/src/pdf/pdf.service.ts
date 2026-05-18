import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ClientKafka } from '@nestjs/microservices';
import { firstValueFrom } from 'rxjs';
import * as fs from 'fs';
import * as path from 'path';
import PDFDocument from 'pdfkit';
import { OrderCreatedEvent, PdfGeneratedEvent, KAFKA_TOPICS } from '@nest-gateway/shared';

@Injectable()
export class PdfService implements OnModuleInit {
  private readonly logger = new Logger(PdfService.name);
  private readonly pdfDir = process.env.PDF_OUTPUT_DIR ?? path.join(process.cwd(), 'pdfs');

  constructor(
    @Inject('KAFKA_CLIENT')
    private readonly kafkaClient: ClientKafka,
  ) {}

  async onModuleInit() {
    fs.mkdirSync(this.pdfDir, { recursive: true });
    await this.kafkaClient.connect();
  }

  async generateOrderPdf(event: OrderCreatedEvent): Promise<void> {
    this.logger.log(`Generating PDF for order ${event.orderId}`);

    const pdfPath = path.join(this.pdfDir, `order-${event.orderId}.pdf`);

    await this.writePdf(pdfPath, event);

    this.logger.log(`PDF generated: ${pdfPath}`);

    const pdfEvent: PdfGeneratedEvent = {
      orderId: event.orderId,
      userId: event.userId,
      userEmail: event.userEmail,
      pdfPath,
      createdAt: new Date().toISOString(),
    };

    await firstValueFrom(this.kafkaClient.emit(KAFKA_TOPICS.PDF_GENERATED, pdfEvent));
  }

  private writePdf(filePath: string, event: OrderCreatedEvent): Promise<void> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ margin: 50 });
      const stream = fs.createWriteStream(filePath);

      doc.pipe(stream);

      doc.fontSize(20).text('Order Receipt', { align: 'center' });
      doc.moveDown();

      doc.fontSize(12).text(`Order ID: ${event.orderId}`);
      doc.text(`Customer: ${event.userEmail}`);
      doc.text(`Date: ${new Date(event.createdAt).toLocaleDateString()}`);
      doc.moveDown();

      doc.fontSize(14).text('Items:', { underline: true });
      doc.moveDown(0.5);

      for (const item of event.items) {
        const lineTotal = (item.unitPrice * item.quantity).toFixed(2);
        doc.fontSize(11).text(
          `${item.name}  x${item.quantity}  @ $${item.unitPrice.toFixed(2)}  =  $${lineTotal}`,
        );
      }

      doc.moveDown();
      doc.fontSize(14).text(`Total: $${event.total.toFixed(2)}`, { align: 'right' });

      doc.end();

      stream.on('finish', resolve);
      stream.on('error', reject);
    });
  }
}
