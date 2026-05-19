export interface KafkaEnvelope<T = unknown> {
  messageId: string;
  correlationId: string;
  traceparent: string;
  tracestate: string;
  timestamp: string;
  source: string;
  retryCount: number;
  payload: T;
}

export interface KafkaDlqEnvelope<T = unknown> {
  originalEnvelope: KafkaEnvelope<T>;
  failedTopic: string;
  failedAt: string;
  error: string;
  totalAttempts: number;
}
