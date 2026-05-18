import { OrderStatus } from './order.entity';

export interface OrderItemResult {
  id: string;
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
}

export interface OrderResult {
  id: string;
  userId: string;
  userEmail: string;
  status: OrderStatus;
  total: number;
  items: OrderItemResult[];
  createdAt: Date;
  updatedAt: Date;
}
