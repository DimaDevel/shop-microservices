import { InvalidSagaTransitionError } from '../errors/orders.errors';

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

const ADVANCE_MAP: Partial<Record<SagaStep, SagaStep>> = {
  [SagaStep.RESERVE_STOCK]: SagaStep.PROCESS_PAYMENT,
  [SagaStep.PROCESS_PAYMENT]: SagaStep.COMPLETED,
};

export class Saga {
  static readonly RETRY_TIMEOUT_MS = 30_000;
  static readonly MAX_RETRIES = 3;

  constructor(
    readonly id: string,
    readonly orderId: string,
    readonly correlationId: string,
    readonly currentStep: SagaStep,
    readonly status: SagaStatus,
    readonly retryCount: number,
    readonly lastError: string | null,
    readonly nextRetryAt: Date | null,
    readonly createdAt: Date,
    readonly updatedAt: Date,
  ) {}

  static create(orderId: string, correlationId: string): Saga {
    const now = new Date();
    return new Saga(
      '',
      orderId,
      correlationId,
      SagaStep.RESERVE_STOCK,
      SagaStatus.RUNNING,
      0,
      null,
      new Date(Date.now() + Saga.RETRY_TIMEOUT_MS),
      now,
      now,
    );
  }

  // replaces the 5 copy-pasted if-guards in the old SagaService
  canHandle(step: SagaStep): boolean {
    return this.status === SagaStatus.RUNNING && this.currentStep === step;
  }

  advance(): Saga {
    const next = ADVANCE_MAP[this.currentStep];
    if (!next) throw new InvalidSagaTransitionError(this.currentStep);

    const isCompleted = next === SagaStep.COMPLETED;
    return new Saga(
      this.id,
      this.orderId,
      this.correlationId,
      next,
      isCompleted ? SagaStatus.COMPLETED : SagaStatus.RUNNING,
      this.retryCount,
      this.lastError,
      isCompleted ? null : new Date(Date.now() + Saga.RETRY_TIMEOUT_MS),
      this.createdAt,
      new Date(),
    );
  }

  startCompensation(reason: string): Saga {
    return new Saga(
      this.id,
      this.orderId,
      this.correlationId,
      SagaStep.RELEASE_STOCK,
      SagaStatus.RUNNING,
      this.retryCount,
      reason,
      new Date(Date.now() + Saga.RETRY_TIMEOUT_MS),
      this.createdAt,
      new Date(),
    );
  }

  fail(reason: string): Saga {
    return new Saga(
      this.id,
      this.orderId,
      this.correlationId,
      SagaStep.FAILED,
      SagaStatus.FAILED,
      this.retryCount,
      reason,
      null,
      this.createdAt,
      new Date(),
    );
  }

  scheduleRetry(): Saga {
    const nextCount = this.retryCount + 1;
    return new Saga(
      this.id,
      this.orderId,
      this.correlationId,
      this.currentStep,
      this.status,
      nextCount,
      this.lastError,
      new Date(Date.now() + Saga.RETRY_TIMEOUT_MS * Math.pow(2, nextCount)),
      this.createdAt,
      new Date(),
    );
  }

  hasExceededMaxRetries(): boolean {
    return this.retryCount >= Saga.MAX_RETRIES;
  }
}
