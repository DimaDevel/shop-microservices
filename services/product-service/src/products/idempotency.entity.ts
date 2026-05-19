import { Column, CreateDateColumn, Entity, PrimaryColumn } from 'typeorm';

@Entity('idempotency_keys')
export class IdempotencyKeyEntity {
  @PrimaryColumn()
  key: string;

  @Column()
  replyTopic: string;

  @Column({ type: 'jsonb' })
  replyPayload: object;

  @CreateDateColumn()
  processedAt: Date;
}
