import { Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { Interval } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { KafkaProducerService } from '@nest-gateway/kafka';
import { AuthOutboxEntity, OutboxStatus } from './auth-outbox.entity';

@Injectable()
export class AuthOutboxProcessorService {
  private readonly logger = new Logger(AuthOutboxProcessorService.name);
  private readonly maxRetries: number;
  private isProcessing = false;

  constructor(
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
        const records = await manager
          .createQueryBuilder(AuthOutboxEntity, 'outbox')
          .where('outbox.status = :status', { status: OutboxStatus.PENDING })
          .andWhere('outbox.scheduledAt <= :now', { now: new Date() })
          .orderBy('outbox.scheduledAt', 'ASC')
          .limit(10)
          .setLock('pessimistic_partial_write')
          .getMany();

        for (const record of records) {
          try {
            await this.kafkaProducer.publish(record.topic, record.payload, {
              correlationId: ((record.payload as Record<string, unknown>)?.correlationId as string) ?? '',
              messageId: record.id,
            });
            await manager.getRepository(AuthOutboxEntity).update(record.id, {
              status: OutboxStatus.PUBLISHED,
              publishedAt: new Date(),
            });
          } catch (e) {
            const retryCount = record.retryCount + 1;
            const delayMs = Math.min(1000 * Math.pow(2, retryCount), 300_000);
            if (retryCount >= this.maxRetries) {
              await manager.getRepository(AuthOutboxEntity).update(record.id, {
                status: OutboxStatus.FAILED,
                retryCount,
                lastError: (e as Error).message,
              });
            } else {
              await manager.getRepository(AuthOutboxEntity).update(record.id, {
                status: OutboxStatus.PENDING,
                retryCount,
                lastError: (e as Error).message,
                scheduledAt: new Date(Date.now() + delayMs),
              });
            }
            this.logger.warn(`Auth outbox ${record.id} failed (attempt ${retryCount}): ${(e as Error).message}`);
          }
        }
      });
    } catch (err) {
      this.logger.error(`Auth outbox processing error: ${(err as Error).message}`);
    } finally {
      this.isProcessing = false;
    }
  }
}
