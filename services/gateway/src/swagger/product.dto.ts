import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ProductDto {
  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440000' })
  id: string;

  @ApiProperty({ example: 'Wireless Headphones' })
  name: string;

  @ApiPropertyOptional({ example: 'Premium noise-cancelling wireless headphones' })
  description?: string;

  @ApiProperty({ example: 99.99, description: 'Price in USD, up to 2 decimal places' })
  price: number;

  @ApiProperty({ example: 42, description: 'Available stock quantity' })
  stock: number;

  @ApiProperty({ example: '2024-01-01T00:00:00.000Z' })
  createdAt: string;
}

export class CreateProductRequestDto {
  @ApiProperty({ example: 'Wireless Headphones' })
  name: string;

  @ApiPropertyOptional({ example: 'Premium noise-cancelling wireless headphones' })
  description?: string;

  @ApiProperty({ example: 99.99, description: 'Price in USD (max 2 decimal places, must be positive)' })
  price: number;

  @ApiProperty({ example: 42, description: 'Initial stock quantity (integer >= 0)' })
  stock: number;
}

export class UpdateProductRequestDto {
  @ApiPropertyOptional({ example: 'Wireless Headphones Pro' })
  name?: string;

  @ApiPropertyOptional({ example: 'Updated description' })
  description?: string;

  @ApiPropertyOptional({ example: 119.99 })
  price?: number;

  @ApiPropertyOptional({ example: 100 })
  stock?: number;
}
