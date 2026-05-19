import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, LessThanOrEqual, Repository } from 'typeorm';
import { Interval } from '@nestjs/schedule';
import { SagaStateEntity, SagaStatus, SagaStep } from './saga-state.entity';
import { OutboxService } from './outbox.service';
import { OrderEntity, OrderStatus } from './order.entity';
import { OrderItemEntity } from './order-item.entity';
import { OrderItemInput } from './orders.inputs';
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
export class SagaService {
  private readonly logger = new Logger(SagaService.name);
  private readonly RETRY_TIMEOUT_MS = 30_000;
  private readonly MAX_RETRIES = 3;

  constructor(
    @InjectRepository(SagaStateEntity)
    private readonly sagaRepo: Repository<SagaStateEntity>,
    private readonly outboxService: OutboxService,
    private readonly dataSource: DataSource,
  ) {}

  // ── Step 0: start ─────────────────────────────────────────────

  async startSaga(orderId: string, items: OrderItemInput[], correlationId: string, manager: EntityManager): Promise<void> {
    const saga = await manager.getRepository(SagaStateEntity).save(
      manager.getRepository(SagaStateEntity).create({
        orderId,
        correlationId,
        currentStep: SagaStep.RESERVE_STOCK,
        status: SagaStatus.RUNNING,
        nextRetryAt: new Date(Date.now() + this.RETRY_TIMEOUT_MS),
      }),
    );

    const command: ReserveStockCommand = {
      commandId: saga.id,
      orderId,
      correlationId,
      items,
    };

    await this.outboxService.write(
      manager,
      orderId,
      KAFKA_TOPICS.RESERVE_STOCK,
      orderId,
      command,
    );
  }

  // ── Step 1 success: stock reserved → process payment ─────────

  async onStockReserved(event: StockReservedEvent): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      // FOR UPDATE serialises this handler against retryStuckSagas running on another
      // instance; without the lock both could read the same step and produce duplicate
      // state transitions or a step rollback (last save wins).
      const saga = await manager.getRepository(SagaStateEntity).findOne({
        where: { orderId: event.orderId },
        lock: { mode: 'pessimistic_write' },
      });

      if (!saga || saga.status !== SagaStatus.RUNNING || saga.currentStep !== SagaStep.RESERVE_STOCK) {
        this.logger.warn(`[${event.correlationId}] Ignoring duplicate stock-reserved for order ${event.orderId}`);
        return;
      }

      // Persist reserved item details so we have them for compensation later
      for (const item of event.items) {
        await manager.getRepository(OrderItemEntity).update(
          { orderId: event.orderId, productId: item.productId },
          { productName: item.name, unitPrice: item.unitPrice },
        );
      }
      await manager.getRepository(OrderEntity).update(
        { id: event.orderId },
        { total: event.total },
      );

      saga.currentStep = SagaStep.PROCESS_PAYMENT;
      saga.nextRetryAt = new Date(Date.now() + this.RETRY_TIMEOUT_MS);
      await manager.getRepository(SagaStateEntity).save(saga);

      const order = await manager.getRepository(OrderEntity).findOne({ where: { id: event.orderId } });

      const command: ProcessPaymentCommand = {
        commandId: `${saga.id}-pay`,
        orderId: event.orderId,
        correlationId: saga.correlationId ?? '',
        userId: order.userId,
        amount: event.total,
      };

      await this.outboxService.write(
        manager,
        event.orderId,
        KAFKA_TOPICS.PROCESS_PAYMENT,
        event.orderId,
        command,
      );
    });
  }

  // ── Step 1 failure: reservation failed → cancel immediately ──

  async onStockReservationFailed(event: StockReservationFailedEvent): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const saga = await manager.getRepository(SagaStateEntity).findOne({
        where: { orderId: event.orderId },
        lock: { mode: 'pessimistic_write' },
      });

      if (!saga || saga.status !== SagaStatus.RUNNING || saga.currentStep !== SagaStep.RESERVE_STOCK) {
        this.logger.warn(`[${event.correlationId}] Ignoring duplicate stock-reservation-failed for order ${event.orderId}`);
        return;
      }

      await this.cancelOrder(manager, saga, event.orderId, event.reason);
    });
  }

  // ── Step 2 success: payment processed → confirm order ────────

  async onPaymentProcessed(event: PaymentProcessedEvent): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const saga = await manager.getRepository(SagaStateEntity).findOne({
        where: { orderId: event.orderId },
        lock: { mode: 'pessimistic_write' },
      });

      if (!saga || saga.status !== SagaStatus.RUNNING || saga.currentStep !== SagaStep.PROCESS_PAYMENT) {
        this.logger.warn(`[${event.correlationId}] Ignoring duplicate payment-processed for order ${event.orderId}`);
        return;
      }

      await manager.getRepository(OrderEntity).update(
        { id: event.orderId },
        { status: OrderStatus.CONFIRMED },
      );

      saga.currentStep = SagaStep.COMPLETED;
      saga.status = SagaStatus.COMPLETED;
      saga.nextRetryAt = null;
      await manager.getRepository(SagaStateEntity).save(saga);

      const order = await manager.getRepository(OrderEntity).findOne({
        where: { id: event.orderId },
        relations: ['items'],
      });

      const confirmedEvent: OrderConfirmedEvent = {
        orderId: order.id,
        userId: order.userId,
        userEmail: order.userEmail,
        correlationId: saga.correlationId ?? '',
        items: order.items.map((i) => ({
          productId: i.productId,
          name: i.productName,
          quantity: i.quantity,
          unitPrice: Number(i.unitPrice),
        })),
        total: Number(order.total),
        confirmedAt: new Date().toISOString(),
      };

      await this.outboxService.write(
        manager,
        event.orderId,
        KAFKA_TOPICS.ORDER_CONFIRMED,
        event.orderId,
        confirmedEvent,
      );

      this.logger.log(`[${saga.correlationId}] Order ${event.orderId} confirmed`);
    });
  }

  // ── Step 2 failure: payment failed → release stock (compensation) ─

  async onPaymentFailed(event: PaymentFailedEvent): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const saga = await manager.getRepository(SagaStateEntity).findOne({
        where: { orderId: event.orderId },
        lock: { mode: 'pessimistic_write' },
      });

      if (!saga || saga.status !== SagaStatus.RUNNING || saga.currentStep !== SagaStep.PROCESS_PAYMENT) {
        this.logger.warn(`[${event.correlationId}] Ignoring duplicate payment-failed for order ${event.orderId}`);
        return;
      }

      saga.currentStep = SagaStep.RELEASE_STOCK;
      saga.lastError = event.reason;
      saga.nextRetryAt = new Date(Date.now() + this.RETRY_TIMEOUT_MS);
      await manager.getRepository(SagaStateEntity).save(saga);

      const order = await manager.getRepository(OrderEntity).findOne({
        where: { id: event.orderId },
        relations: ['items'],
      });

      const command: ReleaseStockCommand = {
        commandId: `${saga.id}-release`,
        orderId: event.orderId,
        correlationId: saga.correlationId ?? '',
        items: order.items.map((i) => ({ productId: i.productId, quantity: i.quantity })),
      };

      await this.outboxService.write(
        manager,
        event.orderId,
        KAFKA_TOPICS.RELEASE_STOCK,
        event.orderId,
        command,
      );

      this.logger.warn(`[${saga.correlationId}] Payment failed for order ${event.orderId}, releasing stock`);
    });
  }

  // ── Compensation complete: stock released → cancel order ─────

  async onStockReleased(event: StockReleasedEvent): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const saga = await manager.getRepository(SagaStateEntity).findOne({
        where: { orderId: event.orderId },
        lock: { mode: 'pessimistic_write' },
      });

      if (!saga || saga.status !== SagaStatus.RUNNING || saga.currentStep !== SagaStep.RELEASE_STOCK) {
        this.logger.warn(`[${event.correlationId}] Ignoring duplicate stock-released for order ${event.orderId}`);
        return;
      }

      await this.cancelOrder(manager, saga, event.orderId, saga.lastError ?? 'Payment failed');
    });
  }

  // ── Retry scheduler: re-send commands for timed-out steps ────

  @Interval(10_000)
  async retryStuckSagas(): Promise<void> {
    const stuck = await this.sagaRepo.find({
      where: { status: SagaStatus.RUNNING, nextRetryAt: LessThanOrEqual(new Date()) },
      take: 10,
    });

    for (const saga of stuck) {
      await this.dataSource.transaction(async (manager) => {
        const sagaRepo = manager.getRepository(SagaStateEntity);
        // FOR UPDATE SKIP LOCKED: if a Kafka event handler on another instance already
        // holds the lock for this saga row (e.g. advancing it past the stuck step),
        // skip it rather than block — the event handler is already doing the right thing.
        // Without this, the retry scheduler and an event handler could both read the same
        // step and one would overwrite the other's save, corrupting saga state.
        const freshSaga = await sagaRepo
          .createQueryBuilder('saga')
          .where('saga.id = :id', { id: saga.id })
          .andWhere('saga.status = :status', { status: SagaStatus.RUNNING })
          .setLock('pessimistic_partial_write')
          .getOne();

        if (!freshSaga) return;

        if (freshSaga.retryCount >= this.MAX_RETRIES) {
          freshSaga.status = SagaStatus.FAILED;
          freshSaga.lastError = 'Max retries exceeded';
          await sagaRepo.save(freshSaga);
          this.logger.error(`[${freshSaga.correlationId}] Saga for order ${freshSaga.orderId} permanently failed after ${this.MAX_RETRIES} retries`);
          return;
        }

        this.logger.warn(`[${freshSaga.correlationId}] Retrying saga for order ${freshSaga.orderId}, step=${freshSaga.currentStep}, attempt=${freshSaga.retryCount + 1}`);

        freshSaga.retryCount += 1;
        freshSaga.nextRetryAt = new Date(Date.now() + this.RETRY_TIMEOUT_MS * Math.pow(2, freshSaga.retryCount));
        await sagaRepo.save(freshSaga);

        const order = await manager.getRepository(OrderEntity).findOne({
          where: { id: freshSaga.orderId },
          relations: ['items'],
        });

        const cid = freshSaga.correlationId ?? '';

        if (freshSaga.currentStep === SagaStep.RESERVE_STOCK) {
          const command: ReserveStockCommand = {
            commandId: freshSaga.id,
            orderId: freshSaga.orderId,
            correlationId: cid,
            items: order.items.map((i) => ({ productId: i.productId, quantity: i.quantity })),
          };
          await this.outboxService.write(manager, freshSaga.orderId, KAFKA_TOPICS.RESERVE_STOCK, freshSaga.orderId, command);
        }

        if (freshSaga.currentStep === SagaStep.PROCESS_PAYMENT) {
          const command: ProcessPaymentCommand = {
            commandId: `${freshSaga.id}-pay`,
            orderId: freshSaga.orderId,
            correlationId: cid,
            userId: order.userId,
            amount: Number(order.total),
          };
          await this.outboxService.write(manager, freshSaga.orderId, KAFKA_TOPICS.PROCESS_PAYMENT, freshSaga.orderId, command);
        }

        if (freshSaga.currentStep === SagaStep.RELEASE_STOCK) {
          const command: ReleaseStockCommand = {
            commandId: `${freshSaga.id}-release`,
            orderId: freshSaga.orderId,
            correlationId: cid,
            items: order.items.map((i) => ({ productId: i.productId, quantity: i.quantity })),
          };
          await this.outboxService.write(manager, freshSaga.orderId, KAFKA_TOPICS.RELEASE_STOCK, freshSaga.orderId, command);
        }
      });
    }
  }

  // ── Private helpers ───────────────────────────────────────────

  private async cancelOrder(
    manager: EntityManager,
    saga: SagaStateEntity,
    orderId: string,
    reason: string,
  ): Promise<void> {
    await manager.getRepository(OrderEntity).update({ id: orderId }, { status: OrderStatus.CANCELLED });

    saga.currentStep = SagaStep.FAILED;
    saga.status = SagaStatus.FAILED;
    saga.lastError = reason;
    saga.nextRetryAt = null;
    await manager.getRepository(SagaStateEntity).save(saga);

    const order = await manager.getRepository(OrderEntity).findOne({ where: { id: orderId } });

    const cancelledEvent: OrderCancelledEvent = {
      orderId: order.id,
      userId: order.userId,
      userEmail: order.userEmail,
      correlationId: saga.correlationId ?? '',
      reason,
      cancelledAt: new Date().toISOString(),
    };

    await this.outboxService.write(
      manager,
      orderId,
      KAFKA_TOPICS.ORDER_CANCELLED,
      orderId,
      cancelledEvent,
    );

    this.logger.log(`[${saga.correlationId}] Order ${orderId} cancelled: ${reason}`);
  }
}
