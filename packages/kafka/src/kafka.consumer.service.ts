import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Consumer, EachMessagePayload, Kafka } from 'kafkajs';
import { context, propagation, SpanStatusCode, trace } from '@opentelemetry/api';
import { KafkaDlqEnvelope, KafkaEnvelope } from './kafka.envelope';
import { KafkaModuleOptions, SubscribeOptions } from './kafka.options';
import { KafkaProducerService } from './kafka.producer.service';

@Injectable()
export class KafkaConsumerService implements OnModuleInit, OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(KafkaConsumerService.name);
  private consumer: Consumer;
  private readonly subscriptions: SubscribeOptions[] = [];

  constructor(
    private readonly kafka: Kafka,
    private readonly producer: KafkaProducerService,
    private readonly options: KafkaModuleOptions,
  ) {}

  /** Called before feature-module OnModuleInit hooks: just connect. */
  async onModuleInit(): Promise<void> {
    this.consumer = this.kafka.consumer({ groupId: this.options.groupId });
    await this.consumer.connect();
  }

  /**
   * Called after ALL OnModuleInit hooks across all modules have completed.
   * By this point every handler has registered its subscriptions.
   */
  async onApplicationBootstrap(): Promise<void> {
    for (const sub of this.subscriptions) {
      await this.consumer.subscribe({ topic: sub.topic, fromBeginning: false });
    }
    if (this.subscriptions.length > 0) {
      await this.consumer.run({ eachMessage: (p) => this.dispatch(p) });
      this.logger.log(
        `Kafka consumer started (group: ${this.options.groupId}) topics: ${this.subscriptions.map((s) => s.topic).join(', ')}`,
      );
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.consumer.disconnect();
  }

  subscribe<T>(options: SubscribeOptions<T>): void {
    this.subscriptions.push(options as SubscribeOptions);
  }

  private async dispatch({ topic, message }: EachMessagePayload): Promise<void> {
    const raw = message.value?.toString();
    if (!raw) return;

    let envelope: KafkaEnvelope;
    try {
      envelope = JSON.parse(raw) as KafkaEnvelope;
    } catch {
      this.logger.error(`Unparseable message on ${topic}: ${raw.slice(0, 200)}`);
      return;
    }

    const sub = this.subscriptions.find((s) => s.topic === topic);
    if (!sub) return;

    const parentCtx = propagation.extract(context.active(), {
      traceparent: envelope.traceparent ?? '',
      tracestate: envelope.tracestate ?? '',
    });
    const span = trace.getTracer('kafka').startSpan(`consume ${topic}`, undefined, parentCtx);
    const activeCtx = trace.setSpan(parentCtx, span);

    const maxRetries = sub.maxRetries ?? 3;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        await context.with(activeCtx, () => sub.handler(envelope));
        span.end();
        return;
      } catch (err) {
        const msg = (err as Error).message;
        this.logger.warn(`[${envelope.correlationId}] ${topic} failed (attempt ${attempt}/${maxRetries}): ${msg}`);
        if (attempt === maxRetries) {
          span.setStatus({ code: SpanStatusCode.ERROR, message: msg });
          span.end();
          await this.sendToDlq(topic, envelope, err as Error, maxRetries);
          return;
        }
        await new Promise((r) => setTimeout(r, 300 * Math.pow(2, attempt - 1)));
      }
    }
  }

  private async sendToDlq(topic: string, envelope: KafkaEnvelope, err: Error, totalAttempts: number): Promise<void> {
    const dlqTopic = `${topic}.dlq`;
    const dlqPayload: KafkaDlqEnvelope = {
      originalEnvelope: envelope,
      failedTopic: topic,
      failedAt: new Date().toISOString(),
      error: err.message,
      totalAttempts,
    };
    try {
      await this.producer.publish(dlqTopic, dlqPayload, {
        correlationId: envelope.correlationId,
      });
      this.logger.error(`[${envelope.correlationId}] Sent to DLQ: ${dlqTopic}`);
    } catch (dlqErr) {
      this.logger.error(`[${envelope.correlationId}] DLQ send failed (${dlqTopic}): ${(dlqErr as Error).message}`);
    }
  }
}
