import { Role } from '../constants';

export interface JwtPayload {
  sub: string;
  email: string;
  roles: Role[];
  jti?: string;
  iat?: number;
  exp?: number;
}

export interface RequestUser {
  id: string;
  email: string;
  roles: Role[];
}

export interface ApiError {
  statusCode: number;
  code: string;
  message: string;
  correlationId?: string;
  timestamp: string;
}

// ── Base interfaces ───────────────────────────────────────────

export interface BaseCommand {
  commandId: string;
  orderId: string;
  correlationId: string;
}

export interface BaseOrderEvent {
  orderId: string;
  userId: string;
  userEmail: string;
  correlationId: string;
}

// ── Shared item type used in stock/confirmed events ───────────
export interface OrderCreatedEventItem {
  productId: string;
  name: string;
  quantity: number;
  unitPrice: number;
}

// ── Commands (orchestrator → service handlers) ────────────────

export interface ReserveStockCommand extends BaseCommand {
  // commandId is the idempotency key — equals saga state ID
  items: Array<{ productId: string; quantity: number }>;
}

export interface ReleaseStockCommand extends BaseCommand {
  items: Array<{ productId: string; quantity: number }>;
}

export interface ProcessPaymentCommand extends BaseCommand {
  userId: string;
  amount: number;
}

// ── Replies (service handlers → orchestrator) ─────────────────

export interface StockReservedEvent extends BaseCommand {
  items: OrderCreatedEventItem[];
  total: number;
}

export interface StockReservationFailedEvent extends BaseCommand {
  reason: string;
}

export type StockReleasedEvent = BaseCommand;

export interface PaymentProcessedEvent extends BaseCommand {
  transactionId: string;
}

export interface PaymentFailedEvent extends BaseCommand {
  reason: string;
}

// ── Domain events (broadcast to downstream consumers) ─────────

export interface OrderConfirmedEvent extends BaseOrderEvent {
  items: OrderCreatedEventItem[];
  total: number;
  confirmedAt: string;
}

export interface OrderCancelledEvent extends BaseOrderEvent {
  reason: string;
  cancelledAt: string;
}

export interface PdfGeneratedEvent extends BaseOrderEvent {
  pdfPath: string;
  createdAt: string;
}

export interface UserRegisteredEvent {
  userId: string;
  email: string;
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface PaginatedResult<T> {
  data: T[];
  meta: PaginationMeta;
}
