// Заголовки которые Gateway прокидывает в сервисы
export const HEADERS = {
  CORRELATION_ID: 'x-correlation-id',
  USER_ID: 'x-user-id',
  USER_EMAIL: 'x-user-email',
  USER_ROLES: 'x-roles',
  INTERNAL_SECRET: 'x-internal-secret',
} as const;

export enum Role {
  USER = 'user',
  ADMIN = 'admin',
  MODERATOR = 'moderator',
}

export const KAFKA_TOPICS = {
  // Commands: orchestrator → service handlers
  RESERVE_STOCK: 'orders.reserve-stock',
  RELEASE_STOCK: 'orders.release-stock',
  PROCESS_PAYMENT: 'orders.process-payment',

  // Replies: service handlers → orchestrator
  STOCK_RESERVED: 'orders.stock-reserved',
  STOCK_RESERVATION_FAILED: 'orders.stock-reservation-failed',
  STOCK_RELEASED: 'orders.stock-released',
  PAYMENT_PROCESSED: 'orders.payment-processed',
  PAYMENT_FAILED: 'orders.payment-failed',

  // Domain events: broadcast to downstream consumers
  ORDER_CONFIRMED: 'orders.order-confirmed',
  ORDER_CANCELLED: 'orders.order-cancelled',

  // PDF pipeline (choreography)
  PDF_GENERATED: 'pdf.pdf-generated',
} as const;
