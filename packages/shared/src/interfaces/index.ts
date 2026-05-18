import { Role } from '../constants';

// JWT payload — то что лежит внутри токена
export interface JwtPayload {
  sub: string;       // user id
  email: string;
  roles: Role[];
  iat?: number;
  exp?: number;
}

// Объект пользователя который появляется на req.user после JWT Guard
export interface RequestUser {
  id: string;
  email: string;
  roles: Role[];
}

// Стандартный формат ошибки API
export interface ApiError {
  statusCode: number;
  code: string;
  message: string;
  correlationId?: string;
  timestamp: string;
}

export interface OrderCreatedEventItem {
  productId: string;
  name: string;
  quantity: number;
  unitPrice: number;
}

export interface OrderCreatedEvent {
  orderId: string;
  userId: string;
  userEmail: string;
  items: OrderCreatedEventItem[];
  total: number;
  createdAt: string;
}

export interface PdfGeneratedEvent {
  orderId: string;
  userId: string;
  userEmail: string;
  pdfPath: string;
  createdAt: string;
}
