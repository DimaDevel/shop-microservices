import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';
import { OutboxStatus } from '@nest-gateway/shared';

export { OutboxStatus };

@Entity('auth_outbox')
export class AuthOutboxEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  aggregateId: string;

  @Column()
  topic: string;

  @Column()
  messageKey: string;

  @Column({ type: 'jsonb' })
  payload: object;

  @Column({ type: 'enum', enum: OutboxStatus, default: OutboxStatus.PENDING })
  status: OutboxStatus;

  @Column({ default: 0 })
  retryCount: number;

  @Column({ type: 'text', nullable: true })
  lastError: string | null;

  @Column({ type: 'timestamptz', default: () => 'NOW()' })
  scheduledAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  publishedAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;
}
