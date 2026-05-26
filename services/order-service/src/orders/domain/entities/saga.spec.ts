import { Saga, SagaStep, SagaStatus } from './saga';
import { InvalidSagaTransitionError } from '../errors/orders.errors';

const makeSaga = (step: SagaStep = SagaStep.RESERVE_STOCK, status: SagaStatus = SagaStatus.RUNNING, retryCount = 0): Saga =>
  new Saga('saga-1', 'order-1', 'corr-1', step, status, retryCount, null, new Date(), new Date(), new Date());

describe('Saga', () => {
  describe('create', () => {
    it('starts in RESERVE_STOCK / RUNNING', () => {
      const data = Saga.create('order-1', 'corr-1');
      expect(data.currentStep).toBe(SagaStep.RESERVE_STOCK);
      expect(data.status).toBe(SagaStatus.RUNNING);
      expect(data.retryCount).toBe(0);
      expect(data.nextRetryAt).toBeInstanceOf(Date);
    });
  });

  describe('canHandle', () => {
    it('returns true when status is RUNNING and step matches', () => {
      const saga = makeSaga(SagaStep.RESERVE_STOCK, SagaStatus.RUNNING);
      expect(saga.canHandle(SagaStep.RESERVE_STOCK)).toBe(true);
    });

    it('returns false when step does not match', () => {
      const saga = makeSaga(SagaStep.RESERVE_STOCK, SagaStatus.RUNNING);
      expect(saga.canHandle(SagaStep.PROCESS_PAYMENT)).toBe(false);
    });

    it('returns false when status is not RUNNING', () => {
      const saga = makeSaga(SagaStep.RESERVE_STOCK, SagaStatus.COMPLETED);
      expect(saga.canHandle(SagaStep.RESERVE_STOCK)).toBe(false);
    });
  });

  describe('advance', () => {
    it('RESERVE_STOCK → PROCESS_PAYMENT (still RUNNING)', () => {
      const saga = makeSaga(SagaStep.RESERVE_STOCK);
      const advanced = saga.advance();
      expect(advanced.currentStep).toBe(SagaStep.PROCESS_PAYMENT);
      expect(advanced.status).toBe(SagaStatus.RUNNING);
      expect(advanced.nextRetryAt).toBeInstanceOf(Date);
    });

    it('PROCESS_PAYMENT → COMPLETED (status = COMPLETED, nextRetryAt = null)', () => {
      const saga = makeSaga(SagaStep.PROCESS_PAYMENT);
      const advanced = saga.advance();
      expect(advanced.currentStep).toBe(SagaStep.COMPLETED);
      expect(advanced.status).toBe(SagaStatus.COMPLETED);
      expect(advanced.nextRetryAt).toBeNull();
    });

    it('returns a new Saga instance (immutability)', () => {
      const saga = makeSaga(SagaStep.RESERVE_STOCK);
      const advanced = saga.advance();
      expect(advanced).not.toBe(saga);
      expect(saga.currentStep).toBe(SagaStep.RESERVE_STOCK);
    });

    it('throws InvalidSagaTransitionError on COMPLETED', () => {
      const saga = makeSaga(SagaStep.COMPLETED, SagaStatus.COMPLETED);
      expect(() => saga.advance()).toThrow(InvalidSagaTransitionError);
    });

    it('throws InvalidSagaTransitionError on FAILED', () => {
      const saga = makeSaga(SagaStep.FAILED, SagaStatus.FAILED);
      expect(() => saga.advance()).toThrow(InvalidSagaTransitionError);
    });
  });

  describe('startCompensation', () => {
    it('transitions to RELEASE_STOCK and stores reason', () => {
      const saga = makeSaga(SagaStep.PROCESS_PAYMENT);
      const compensating = saga.startCompensation('insufficient funds');
      expect(compensating.currentStep).toBe(SagaStep.RELEASE_STOCK);
      expect(compensating.status).toBe(SagaStatus.RUNNING);
      expect(compensating.lastError).toBe('insufficient funds');
      expect(compensating.nextRetryAt).toBeInstanceOf(Date);
    });
  });

  describe('fail', () => {
    it('transitions to FAILED status and stores reason', () => {
      const saga = makeSaga(SagaStep.RELEASE_STOCK);
      const failed = saga.fail('stock unavailable');
      expect(failed.currentStep).toBe(SagaStep.FAILED);
      expect(failed.status).toBe(SagaStatus.FAILED);
      expect(failed.lastError).toBe('stock unavailable');
      expect(failed.nextRetryAt).toBeNull();
    });
  });

  describe('scheduleRetry', () => {
    it('increments retryCount and doubles nextRetryAt', () => {
      const saga = makeSaga(SagaStep.RESERVE_STOCK, SagaStatus.RUNNING, 1);
      const retried = saga.scheduleRetry();
      expect(retried.retryCount).toBe(2);
      const expectedDelay = Saga.RETRY_TIMEOUT_MS * Math.pow(2, 2);
      expect(retried.nextRetryAt!.getTime()).toBeGreaterThanOrEqual(Date.now() + expectedDelay - 100);
    });
  });

  describe('hasExceededMaxRetries', () => {
    it('returns false when retryCount < MAX_RETRIES', () => {
      const saga = makeSaga(SagaStep.RESERVE_STOCK, SagaStatus.RUNNING, Saga.MAX_RETRIES - 1);
      expect(saga.hasExceededMaxRetries()).toBe(false);
    });

    it('returns true when retryCount === MAX_RETRIES', () => {
      const saga = makeSaga(SagaStep.RESERVE_STOCK, SagaStatus.RUNNING, Saga.MAX_RETRIES);
      expect(saga.hasExceededMaxRetries()).toBe(true);
    });
  });
});
