import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Interval } from '@nestjs/schedule';
import { KafkaProducerService } from '@nest-gateway/kafka';
import { OutboxEntity, OutboxStatus } from './outbox.entity';

@Injectable()
export class OutboxProcessorService {
  private readonly logger = new Logger(OutboxProcessorService.name);
  private readonly MAX_RETRIES = 5;
  // Guards against overlapping ticks within the same process instance.
  // Cross-instance races are prevented by SELECT FOR UPDATE SKIP LOCKED below.
  private isProcessing = false;

  constructor(
    @InjectRepository(OutboxEntity)
    private readonly outboxRepo: Repository<OutboxEntity>,
    private readonly kafkaProducer: KafkaProducerService,
  ) {}

  @Interval(1000)
  async processPending(): Promise<void> {
    if (this.isProcessing) return;
    this.isProcessing = true;
    try {
      await this.outboxRepo.manager.transaction(async (manager) => {
        // FOR UPDATE SKIP LOCKED: each service instance atomically claims a disjoint
        // set of rows. Rows already locked by another instance are skipped rather than
        // blocked, so multiple instances process different batches in parallel without
        // producing duplicate Kafka messages.
        const records = await manager
          .createQueryBuilder(OutboxEntity, 'outbox')
          .where('outbox.status = :status', { status: OutboxStatus.PENDING })
          .andWhere('outbox.scheduledAt <= :now', { now: new Date() })
          .orderBy('outbox.scheduledAt', 'ASC')
          .limit(10)
          .setLock('pessimistic_partial_write')
          .getMany();

        for (const record of records) {
          try {
            const correlationId = (record.payload as any)?.correlationId ?? '';
            await this.kafkaProducer.publish(record.topic, record.payload, {
              correlationId,
              // messageId ties this Kafka message to the outbox row; saga participants
              // use it as the idempotency key so a re-published row is a no-op.
              messageId: record.id,
            });
            await manager.getRepository(OutboxEntity).update(record.id, {
              status: OutboxStatus.PUBLISHED,
              publishedAt: new Date(),
            });
          } catch (e) {
            const retryCount = record.retryCount + 1;
            // Exponential back-off capped at 5 minutes so a flaky Kafka broker does
            // not flood the poll loop.
            const delayMs = Math.min(1000 * Math.pow(2, retryCount), 300_000);
            await manager.getRepository(OutboxEntity).update(record.id, {
              status: retryCount >= this.MAX_RETRIES ? OutboxStatus.FAILED : OutboxStatus.PENDING,
              retryCount,
              lastError: (e as Error).message,
              scheduledAt: new Date(Date.now() + delayMs),
            });
            this.logger.warn(`Outbox ${record.id} failed (attempt ${retryCount}): ${(e as Error).message}`);
          }
        }
      });
    } finally {
      this.isProcessing = false;
    }
  }
}
