import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ApiErrorDto {
  @ApiProperty({ example: 401 })
  statusCode: number;

  @ApiProperty({ example: 'UNAUTHORIZED' })
  code: string;

  @ApiProperty({ example: 'Invalid credentials' })
  message: string;

  @ApiPropertyOptional({ example: '550e8400-e29b-41d4-a716-446655440000' })
  correlationId?: string;

  @ApiProperty({ example: '2024-01-01T00:00:00.000Z' })
  timestamp: string;
}

export class MessageDto {
  @ApiProperty({ example: 'Operation completed successfully' })
  message: string;
}
