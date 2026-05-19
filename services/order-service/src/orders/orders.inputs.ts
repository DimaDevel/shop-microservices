export interface OrderItemInput {
  productId: string;
  quantity: number;
}

export interface CreateOrderInput {
  userId: string;
  userEmail: string;
  correlationId: string;
  items: OrderItemInput[];
}
