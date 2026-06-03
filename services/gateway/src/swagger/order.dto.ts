import { ApiProperty } from '@nestjs/swagger';

export class OrderItemRequestDto {
  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440000', description: 'Product UUID' })
  productId: string;

  @ApiProperty({ example: 2, description: 'Quantity (positive integer)' })
  quantity: number;
}

export class CreateOrderRequestDto {
  @ApiProperty({ type: [OrderItemRequestDto] })
  items: OrderItemRequestDto[];
}

export class OrderItemDto {
  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440000' })
  productId: string;

  @ApiProperty({ example: 'Wireless Headphones' })
  name: string;

  @ApiProperty({ example: 2 })
  quantity: number;

  @ApiProperty({ example: 99.99 })
  unitPrice: number;
}

export class OrderDto {
  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440000' })
  id: string;

  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440000' })
  userId: string;

  @ApiProperty({
    example: 'pending',
    enum: ['pending', 'confirmed', 'cancelled', 'failed'],
    description: 'Order lifecycle status',
  })
  status: string;

  @ApiProperty({ type: [OrderItemDto] })
  items: OrderItemDto[];

  @ApiProperty({ example: 199.98, description: 'Total order value in USD' })
  total: number;

  @ApiProperty({ example: '2024-01-01T00:00:00.000Z' })
  createdAt: string;
}
