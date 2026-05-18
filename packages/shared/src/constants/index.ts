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
  ORDER_CREATED: 'order.created',
  PDF_GENERATED: 'pdf.generated',
} as const;
