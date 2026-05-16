// Заголовки которые Gateway прокидывает в сервисы
export const HEADERS = {
  CORRELATION_ID: 'x-correlation-id',
  USER_ID: 'x-user-id',
  USER_EMAIL: 'x-user-email',
  USER_ROLES: 'x-roles',
} as const;

export enum Role {
  USER = 'user',
  ADMIN = 'admin',
  MODERATOR = 'moderator',
}
