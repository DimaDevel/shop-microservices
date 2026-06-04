import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Kafka, Producer } from 'kafkajs';
import { context, propagation, SpanStatusCode, trace } from '@opentelemetry/api';
import { randomUUID } from 'crypto';
import { KafkaEnvelope } from './kafka.envelope';
import { KafkaModuleOptions } from './kafka.options';

@Injectable()
export class KafkaProducerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(KafkaProducerService.name);
  private producer: Producer;

  constructor(
    private readonly kafka: Kafka,
    private readonly options: KafkaModuleOptions,
  ) {}

  async onModuleInit(): Promise<void> {
    this.producer = this.kafka.producer();
    await this.producer.connect();
    this.logger.log('Kafka producer connected');
  }

  async onModuleDestroy(): Promise<void> {
    await this.producer.disconnect();
  }

  async publish<T>(
    topic: string,
    payload: T,
    meta: { correlationId?: string; messageId?: string } = {},
  ): Promise<void> {
    const carrier: Record<string, string> = {};
    propagation.inject(context.active(), carrier);

    const envelope: KafkaEnvelope<T> = {
      messageId: meta.messageId ?? randomUUID(),
      correlationId: meta.correlationId ?? '',
      traceparent: carrier['traceparent'] ?? '',
      tracestate: carrier['tracestate'] ?? '',
      timestamp: new Date().toISOString(),
      source: this.options.source,
      retryCount: 0,
      payload,
    };

    const span = trace.getTracer('kafka').startSpan(`publish ${topic}`);
    try {
      await this.producer.send({
        topic,
        messages: [
          {
            key: envelope.correlationId || envelope.messageId,
            value: JSON.stringify(envelope),
            headers: {
              'x-message-id': envelope.messageId,
              'x-correlation-id': envelope.correlationId,
              traceparent: envelope.traceparent,
              tracestate: envelope.tracestate,
            },
          },
        ],
      });
    } catch (err) {
      span.setStatus({ code: SpanStatusCode.ERROR, message: (err as Error).message });
      throw err;
    } finally {
      span.end();
    }
  }
}
