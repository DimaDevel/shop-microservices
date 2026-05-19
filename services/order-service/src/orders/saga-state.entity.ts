import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

export enum SagaStep {
  RESERVE_STOCK = 'reserve_stock',
  PROCESS_PAYMENT = 'process_payment',
  RELEASE_STOCK = 'release_stock',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

export enum SagaStatus {
  RUNNING = 'running',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

@Entity('saga_states')
export class SagaStateEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  orderId: string;

  @Column({ type: 'enum', enum: SagaStep, default: SagaStep.RESERVE_STOCK })
  currentStep: SagaStep;

  @Column({ type: 'enum', enum: SagaStatus, default: SagaStatus.RUNNING })
  status: SagaStatus;

  @Column({ default: 0 })
  retryCount: number;

  @Column({ type: 'text', nullable: true })
  correlationId: string | null;

  @Column({ type: 'text', nullable: true })
  lastError: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  nextRetryAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
