import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { DataSource, EntityTarget, ObjectLiteral } from 'typeorm';
import { KafkaProducerService } from '@nest-gateway/kafka';
import { OutboxStatus } from '@nest-gateway/shared';

export interface OutboxRecord extends ObjectLiteral {
  id: string;
  status: OutboxStatus;
  scheduledAt: Date;
  retryCount: number;
  topic: string;
  messageKey: string;
  payload: object;
  publishedAt?: Date;
  lastError?: string | null;
}

@Injectable()
export abstract class AbstractOutboxProcessorService<T extends OutboxRecord> {
  protected readonly logger = new Logger(this.constructor.name);
  private readonly maxRetries: number;
  // Guards against overlapping ticks within the same process instance.
  // Cross-instance races are prevented by SELECT FOR UPDATE SKIP LOCKED.
  private isProcessing = false;

  constructor(
    protected readonly dataSource: DataSource,
    protected readonly kafkaProducer: KafkaProducerService,
    config: ConfigService,
  ) {
    this.maxRetries = config.get<number>('OUTBOX_MAX_RETRIES', 5);
  }

  protected abstract getEntityClass(): EntityTarget<T>;

  @Interval(1000)
  async processPending(): Promise<void> {
    if (this.isProcessing) return;
    this.isProcessing = true;
    try {
      await this.dataSource.transaction(async (manager) => {
        const records = await manager
          .createQueryBuilder(this.getEntityClass(), 'outbox')
          .where('outbox.status = :status', { status: OutboxStatus.PENDING })
          .andWhere('outbox.scheduledAt <= :now', { now: new Date() })
          .orderBy('outbox.scheduledAt', 'ASC')
          .limit(10)
          .setLock('pessimistic_partial_write')
          .getMany();

        for (const record of records) {
          try {
            const correlationId = (record.payload as Record<string, unknown>)?.correlationId as string ?? '';
            await this.kafkaProducer.publish(record.topic, record.payload, {
              correlationId,
              // messageId ties this Kafka message to the outbox row; saga participants
              // use it as the idempotency key so a re-published row is a no-op.
              messageId: record.id,
            });
            await manager.getRepository(this.getEntityClass()).update(record.id, {
              status: OutboxStatus.PUBLISHED,
              publishedAt: new Date(),
            });
          } catch (e) {
            const retryCount = record.retryCount + 1;
            // Exponential back-off capped at 5 minutes.
            const delayMs = Math.min(1000 * Math.pow(2, retryCount), 300_000);
            await manager.getRepository(this.getEntityClass()).update(record.id, {
              status: retryCount >= this.maxRetries ? OutboxStatus.FAILED : OutboxStatus.PENDING,
              retryCount,
              lastError: (e as Error).message,
              scheduledAt: new Date(Date.now() + delayMs),
            });
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
