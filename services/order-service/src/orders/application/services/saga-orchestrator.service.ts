import { Injectable, Inject, Logger } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { Interval } from '@nestjs/schedule';
import { IOrderRepository, ORDER_REPOSITORY } from '../../domain/repositories/order.repository';
import { ISagaRepository, SAGA_REPOSITORY } from '../../domain/repositories/saga.repository';
import { IOutboxRepository, OUTBOX_REPOSITORY } from '../../domain/repositories/outbox.repository';
import { Order } from '../../domain/entities/order';
import { Saga, SagaStep } from '../../domain/entities/saga';
import { OrderNotFoundError } from '../../domain/errors/orders.errors';
import {
  KAFKA_TOPICS,
  ReserveStockCommand,
  ReleaseStockCommand,
  ProcessPaymentCommand,
  StockReservedEvent,
  StockReservationFailedEvent,
  StockReleasedEvent,
  PaymentProcessedEvent,
  PaymentFailedEvent,
  OrderConfirmedEvent,
  OrderCancelledEvent,
} from '@nest-gateway/shared';

@Injectable()
export class SagaOrchestrator {
  private readonly logger = new Logger(SagaOrchestrator.name);

  constructor(
    @Inject(ORDER_REPOSITORY) private readonly orderRepo: IOrderRepository,
    @Inject(SAGA_REPOSITORY) private readonly sagaRepo: ISagaRepository,
    @Inject(OUTBOX_REPOSITORY) private readonly outboxRepo: IOutboxRepository,
    private readonly dataSource: DataSource,
  ) {}

  async onStockReserved(event: StockReservedEvent): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const saga = await this.loadSagaForStep(
        event.orderId,
        SagaStep.RESERVE_STOCK,
        event.correlationId,
        'stock-reserved',
        manager,
      );
      if (!saga) return;

      const order = await this.orderRepo.findById(event.orderId, manager);
      if (!order) throw new OrderNotFoundError(event.orderId);
      await this.orderRepo.update(order.confirm(event.total, event.items), manager);

      const advanced = saga.advance();
      await this.sagaRepo.update(advanced, manager);

      const command: ProcessPaymentCommand = {
        commandId: `${saga.id}-pay`,
        orderId: event.orderId,
        correlationId: saga.correlationId,
        userId: order.userId,
        amount: event.total,
      };
      await this.outboxRepo.write(event.orderId, KAFKA_TOPICS.PROCESS_PAYMENT, event.orderId, command, manager);
    });
  }

  async onStockReservationFailed(event: StockReservationFailedEvent): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const saga = await this.loadSagaForStep(
        event.orderId,
        SagaStep.RESERVE_STOCK,
        event.correlationId,
        'stock-reservation-failed',
        manager,
      );
      if (!saga) return;
      await this.performCancellation(manager, saga, event.orderId, event.reason);
    });
  }

  async onPaymentProcessed(event: PaymentProcessedEvent): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const saga = await this.loadSagaForStep(
        event.orderId,
        SagaStep.PROCESS_PAYMENT,
        event.correlationId,
        'payment-processed',
        manager,
      );
      if (!saga) return;

      const advanced = saga.advance();
      await this.sagaRepo.update(advanced, manager);

      const order = await this.orderRepo.findById(event.orderId, manager);
      if (!order) throw new OrderNotFoundError(event.orderId);
      const confirmedEvent: OrderConfirmedEvent = {
        orderId: order.id,
        userId: order.userId,
        userEmail: order.userEmail,
        correlationId: saga.correlationId,
        items: order.items.map((i) => ({
          productId: i.productId,
          name: i.productName,
          quantity: i.quantity,
          unitPrice: i.unitPrice,
        })),
        total: order.total,
        confirmedAt: new Date().toISOString(),
      };
      await this.outboxRepo.write(event.orderId, KAFKA_TOPICS.ORDER_CONFIRMED, event.orderId, confirmedEvent, manager);
      this.logger.log(`[${saga.correlationId}] Order ${event.orderId} confirmed`);
    });
  }

  async onPaymentFailed(event: PaymentFailedEvent): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const saga = await this.loadSagaForStep(
        event.orderId,
        SagaStep.PROCESS_PAYMENT,
        event.correlationId,
        'payment-failed',
        manager,
      );
      if (!saga) return;

      const compensating = saga.startCompensation(event.reason);
      await this.sagaRepo.update(compensating, manager);

      const order = await this.orderRepo.findById(event.orderId, manager);
      if (!order) throw new OrderNotFoundError(event.orderId);
      const command: ReleaseStockCommand = {
        commandId: `${saga.id}-release`,
        orderId: event.orderId,
        correlationId: saga.correlationId,
        items: order.items.map((i) => ({ productId: i.productId, quantity: i.quantity })),
      };
      await this.outboxRepo.write(event.orderId, KAFKA_TOPICS.RELEASE_STOCK, event.orderId, command, manager);
      this.logger.warn(`[${saga.correlationId}] Payment failed for order ${event.orderId}, releasing stock`);
    });
  }

  async onStockReleased(event: StockReleasedEvent): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const saga = await this.loadSagaForStep(
        event.orderId,
        SagaStep.RELEASE_STOCK,
        event.correlationId,
        'stock-released',
        manager,
      );
      if (!saga) return;
      await this.performCancellation(manager, saga, event.orderId, saga.lastError ?? 'Payment failed');
    });
  }

  @Interval(10_000)
  async retryStuckSagas(): Promise<void> {
    let stuck: Saga[];
    try {
      stuck = await this.sagaRepo.findStuck(10);
    } catch (err) {
      this.logger.error(`retryStuckSagas: failed to query stuck sagas: ${(err as Error).message}`);
      return;
    }

    for (const saga of stuck) {
      try {
        await this.dataSource.transaction(async (manager) => {
          const freshSaga = await this.sagaRepo.findByIdSkipLocked(saga.id, manager);
          if (!freshSaga) return;

          if (freshSaga.hasExceededMaxRetries()) {
            await this.sagaRepo.update(freshSaga.fail('Max retries exceeded'), manager);
            this.logger.error(
              `[${freshSaga.correlationId}] Saga for order ${freshSaga.orderId} permanently failed after ${Saga.MAX_RETRIES} retries`,
            );
            return;
          }

          const retried = freshSaga.scheduleRetry();
          await this.sagaRepo.update(retried, manager);
          this.logger.warn(
            `[${freshSaga.correlationId}] Retrying saga for order ${freshSaga.orderId}, step=${freshSaga.currentStep}, attempt=${retried.retryCount}`,
          );

          const order = await this.orderRepo.findById(freshSaga.orderId, manager);
          if (!order) throw new OrderNotFoundError(freshSaga.orderId);
          await this.resendCommand(freshSaga, order, manager);
        });
      } catch (err) {
        this.logger.error(
          `[${saga.correlationId}] retryStuckSagas failed for saga ${saga.id}: ${(err as Error).message}`,
        );
      }
    }
  }

  private async loadSagaForStep(
    orderId: string,
    step: SagaStep,
    correlationId: string,
    eventLabel: string,
    manager: EntityManager,
  ): Promise<Saga | null> {
    const saga = await this.sagaRepo.findByOrderIdWithLock(orderId, manager);
    if (!saga?.canHandle(step)) {
      this.logger.warn(`[${correlationId}] Ignoring duplicate ${eventLabel} for order ${orderId}`);
      return null;
    }
    return saga;
  }

  private async performCancellation(
    manager: EntityManager,
    saga: Saga,
    orderId: string,
    reason: string,
  ): Promise<void> {
    const order = await this.orderRepo.findById(orderId, manager);
    if (!order) throw new OrderNotFoundError(orderId);
    await this.orderRepo.update(order.compensate(), manager);

    const failed = saga.fail(reason);
    await this.sagaRepo.update(failed, manager);

    const cancelledEvent: OrderCancelledEvent = {
      orderId: order.id,
      userId: order.userId,
      userEmail: order.userEmail,
      correlationId: saga.correlationId,
      reason,
      cancelledAt: new Date().toISOString(),
    };
    await this.outboxRepo.write(orderId, KAFKA_TOPICS.ORDER_CANCELLED, orderId, cancelledEvent, manager);
    this.logger.log(`[${saga.correlationId}] Order ${orderId} cancelled: ${reason}`);
  }

  private async resendCommand(saga: Saga, order: Order, manager: EntityManager): Promise<void> {
    const cid = saga.correlationId;

    if (saga.currentStep === SagaStep.RESERVE_STOCK) {
      const command: ReserveStockCommand = {
        commandId: saga.id,
        orderId: saga.orderId,
        correlationId: cid,
        items: order.items.map((i) => ({ productId: i.productId, quantity: i.quantity })),
      };
      await this.outboxRepo.write(saga.orderId, KAFKA_TOPICS.RESERVE_STOCK, saga.orderId, command, manager);
    }

    if (saga.currentStep === SagaStep.PROCESS_PAYMENT) {
      const command: ProcessPaymentCommand = {
        commandId: `${saga.id}-pay`,
        orderId: saga.orderId,
        correlationId: cid,
        userId: order.userId,
        amount: order.total,
      };
      await this.outboxRepo.write(saga.orderId, KAFKA_TOPICS.PROCESS_PAYMENT, saga.orderId, command, manager);
    }

    if (saga.currentStep === SagaStep.RELEASE_STOCK) {
      const command: ReleaseStockCommand = {
        commandId: `${saga.id}-release`,
        orderId: saga.orderId,
        correlationId: cid,
        items: order.items.map((i) => ({ productId: i.productId, quantity: i.quantity })),
      };
      await this.outboxRepo.write(saga.orderId, KAFKA_TOPICS.RELEASE_STOCK, saga.orderId, command, manager);
    }
  }
}
