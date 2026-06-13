import { Injectable, Logger, Inject } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { Interval } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { KafkaProducerService } from '@nest-gateway/kafka';
import { IOutboxRepository, OUTBOX_REPOSITORY } from './domain/repositories/outbox.repository';

@Injectable()
export class OutboxProcessorService {
  private readonly logger = new Logger(OutboxProcessorService.name);
  private readonly maxRetries: number;
  private isProcessing = false;

  constructor(
    @Inject(OUTBOX_REPOSITORY) private readonly outboxRepo: IOutboxRepository,
    private readonly dataSource: DataSource,
    private readonly kafkaProducer: KafkaProducerService,
    private readonly config: ConfigService,
  ) {
    this.maxRetries = this.config.get<number>('OUTBOX_MAX_RETRIES', 5);
  }

  @Interval(1000)
  async processPending(): Promise<void> {
    if (this.isProcessing) return;
    this.isProcessing = true;
    try {
      await this.dataSource.transaction(async (manager) => {
        const records = await this.outboxRepo.findPendingWithLock(10, manager);

        for (const record of records) {
          try {
            const correlationId = ((record.payload as Record<string, unknown>)?.correlationId as string) ?? '';
            await this.kafkaProducer.publish(record.topic, record.payload, {
              correlationId,
              messageId: record.id,
            });
            await this.outboxRepo.markPublished(record.id, manager);
          } catch (e) {
            const retryCount = record.retryCount + 1;
            const delayMs = Math.min(1000 * Math.pow(2, retryCount), 300_000);
            if (retryCount >= this.maxRetries) {
              await this.outboxRepo.permanentlyFail(record.id, retryCount, (e as Error).message, manager);
            } else {
              await this.outboxRepo.scheduleRetry(
                record.id,
                retryCount,
                (e as Error).message,
                new Date(Date.now() + delayMs),
                manager,
              );
            }
            this.logger.warn(`Outbox ${record.id} failed (attempt ${retryCount}): ${(e as Error).message}`);
          }
        }
      });
    } catch (err) {
      this.logger.error(`Outbox processing failed: ${(err as Error).message}`);
    } finally {
      this.isProcessing = false;
    }
  }
}
