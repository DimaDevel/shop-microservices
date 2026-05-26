import { OrderStatus } from '../entities/order';
import { SagaStep } from '../entities/saga';

export class OrderNotFoundError extends Error {
  constructor(id: string) {
    super(`Order ${id} not found`);
    this.name = 'OrderNotFoundError';
  }
}

export class InvalidOrderTransitionError extends Error {
  constructor(from: OrderStatus, to: OrderStatus) {
    super(`Cannot transition order from ${from} to ${to}`);
    this.name = 'InvalidOrderTransitionError';
  }
}

export class InvalidSagaTransitionError extends Error {
  constructor(currentStep: SagaStep) {
    super(`Cannot advance saga from step ${currentStep}`);
    this.name = 'InvalidSagaTransitionError';
  }
}
