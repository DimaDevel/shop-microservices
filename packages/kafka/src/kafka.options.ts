import { KafkaEnvelope } from './kafka.envelope';

export interface KafkaModuleOptions {
  clientId: string;
  brokers: string[];
  groupId: string;
  source: string;
}

export interface SubscribeOptions<T = unknown> {
  topic: string;
  handler: (envelope: KafkaEnvelope<T>) => Promise<void>;
  maxRetries?: number;
}
