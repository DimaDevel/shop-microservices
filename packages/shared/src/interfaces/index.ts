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

// ── Shared item type used in stock/confirmed events ───────────
export interface OrderCreatedEventItem {
  productId: string;
  name: string;
  quantity: number;
  unitPrice: number;
}

// ── Commands (orchestrator → service handlers) ────────────────

export interface ReserveStockCommand {
  commandId: string; // idempotency key — equals saga state ID
  orderId: string;
  correlationId: string;
  items: Array<{ productId: string; quantity: number }>;
}

export interface ReleaseStockCommand {
  commandId: string;
  orderId: string;
  correlationId: string;
  items: Array<{ productId: string; quantity: number }>;
}

export interface ProcessPaymentCommand {
  commandId: string;
  orderId: string;
  correlationId: string;
  userId: string;
  amount: number;
}

// ── Replies (service handlers → orchestrator) ─────────────────

export interface StockReservedEvent {
  commandId: string;
  orderId: string;
  correlationId: string;
  items: OrderCreatedEventItem[];
  total: number;
}

export interface StockReservationFailedEvent {
  commandId: string;
  orderId: string;
  correlationId: string;
  reason: string;
}

export interface StockReleasedEvent {
  commandId: string;
  orderId: string;
  correlationId: string;
}

export interface PaymentProcessedEvent {
  commandId: string;
  orderId: string;
  correlationId: string;
  transactionId: string;
}

export interface PaymentFailedEvent {
  commandId: string;
  orderId: string;
  correlationId: string;
  reason: string;
}

// ── Domain events (broadcast to downstream consumers) ─────────

export interface OrderConfirmedEvent {
  orderId: string;
  userId: string;
  userEmail: string;
  correlationId: string;
  items: OrderCreatedEventItem[];
  total: number;
  confirmedAt: string;
}

export interface OrderCancelledEvent {
  orderId: string;
  userId: string;
  userEmail: string;
  correlationId: string;
  reason: string;
  cancelledAt: string;
}

export interface PdfGeneratedEvent {
  orderId: string;
  userId: string;
  userEmail: string;
  correlationId: string;
  pdfPath: string;
  createdAt: string;
}

export interface UserRegisteredEvent {
  userId: string;
  email: string;
}
