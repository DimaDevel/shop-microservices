import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { KafkaConsumerService, KafkaEnvelope } from '@nest-gateway/kafka';
import { ProductsService } from './products.service';
import { IdempotencyService } from './idempotency.service';
import { OutboxService } from './outbox.service';
import {
  KAFKA_TOPICS,
  ReserveStockCommand,
  ReleaseStockCommand,
  StockReservedEvent,
  StockReservationFailedEvent,
  StockReleasedEvent,
} from '@nest-gateway/shared';
import { ProductNotFoundError, InsufficientStockError } from './products.errors';

@Injectable()
export class ProductsSagaController implements OnModuleInit {
  private readonly logger = new Logger(ProductsSagaController.name);

  constructor(
    private readonly productsService: ProductsService,
    private readonly idempotencyService: IdempotencyService,
    private readonly outboxService: OutboxService,
    private readonly dataSource: DataSource,
    private readonly kafkaConsumer: KafkaConsumerService,
  ) {}

  onModuleInit(): void {
    this.kafkaConsumer.subscribe<ReserveStockCommand>({
      topic: KAFKA_TOPICS.RESERVE_STOCK,
      handler: (e: KafkaEnvelope<ReserveStockCommand>) => this.handleReserveStock(e.payload),
    });
    this.kafkaConsumer.subscribe<ReleaseStockCommand>({
      topic: KAFKA_TOPICS.RELEASE_STOCK,
      handler: (e: KafkaEnvelope<ReleaseStockCommand>) => this.handleReleaseStock(e.payload),
    });
  }

  private async handleReserveStock(command: ReserveStockCommand): Promise<void> {
    this.logger.log(
      `[${command.correlationId}] Reserve-stock for order ${command.orderId}, cmdId: ${command.commandId}`,
    );

    await this.dataSource.transaction(async (manager) => {
      // Idempotency: commandId is checked before touching stock so Kafka at-least-once
      // redelivery or a saga retry never double-reserves inventory. On a duplicate,
      // the stored reply is re-queued so the orchestrator receives it again.
      const existing = await this.idempotencyService.find(manager, command.commandId);
      if (existing) {
        this.logger.log(`[${command.correlationId}] Duplicate command ${command.commandId}, re-scheduling reply`);
        await this.outboxService.write(
          manager,
          command.orderId,
          existing.replyTopic,
          command.orderId,
          existing.replyPayload,
        );
        return;
      }

      try {
        const result = await this.productsService.reserveStock({ items: command.items }, manager);
        const total = result.items.reduce((sum, i) => sum + i.unitPrice * i.quantity, 0);
        const reply: StockReservedEvent = {
          commandId: command.commandId,
          orderId: command.orderId,
          correlationId: command.correlationId,
          items: result.items,
          total,
        };
        await this.idempotencyService.save(manager, command.commandId, KAFKA_TOPICS.STOCK_RESERVED, reply);
        await this.outboxService.write(manager, command.orderId, KAFKA_TOPICS.STOCK_RESERVED, command.orderId, reply);
      } catch (e) {
        if (!(e instanceof ProductNotFoundError) && !(e instanceof InsufficientStockError)) throw e;
        const reply: StockReservationFailedEvent = {
          commandId: command.commandId,
          orderId: command.orderId,
          correlationId: command.correlationId,
          reason: (e as Error).message,
        };
        await this.idempotencyService.save(manager, command.commandId, KAFKA_TOPICS.STOCK_RESERVATION_FAILED, reply);
        await this.outboxService.write(
          manager,
          command.orderId,
          KAFKA_TOPICS.STOCK_RESERVATION_FAILED,
          command.orderId,
          reply,
        );
      }
    });
  }

  private async handleReleaseStock(command: ReleaseStockCommand): Promise<void> {
    this.logger.log(
      `[${command.correlationId}] Release-stock for order ${command.orderId}, cmdId: ${command.commandId}`,
    );

    await this.dataSource.transaction(async (manager) => {
      // Same idempotency guard as reserve: a retried release command must not
      // release stock a second time, which would corrupt inventory counts.
      const existing = await this.idempotencyService.find(manager, command.commandId);
      if (existing) {
        this.logger.log(
          `[${command.correlationId}] Duplicate release command ${command.commandId}, re-scheduling reply`,
        );
        await this.outboxService.write(
          manager,
          command.orderId,
          existing.replyTopic,
          command.orderId,
          existing.replyPayload,
        );
        return;
      }
      await this.productsService.releaseStock(command.items, manager);
      const reply: StockReleasedEvent = {
        commandId: command.commandId,
        orderId: command.orderId,
        correlationId: command.correlationId,
      };
      await this.idempotencyService.save(manager, command.commandId, KAFKA_TOPICS.STOCK_RELEASED, reply);
      await this.outboxService.write(manager, command.orderId, KAFKA_TOPICS.STOCK_RELEASED, command.orderId, reply);
    });
  }
}
