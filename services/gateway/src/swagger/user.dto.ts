import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class UserProfileDto {
  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440000' })
  id: string;

  @ApiProperty({ example: 'user@example.com' })
  email: string;

  @ApiPropertyOptional({ example: 'John Doe' })
  name?: string;

  @ApiPropertyOptional({ example: 'https://example.com/avatar.png' })
  avatarUrl?: string;

  @ApiPropertyOptional({ example: '+14155552671' })
  phone?: string;

  @ApiPropertyOptional({ example: '1990-01-15' })
  dateOfBirth?: string;

  @ApiPropertyOptional({ example: '123 Main St' })
  addressLine?: string;

  @ApiPropertyOptional({ example: 'San Francisco' })
  city?: string;

  @ApiPropertyOptional({ example: 'US', description: 'ISO 3166-1 alpha-2 country code' })
  country?: string;

  @ApiPropertyOptional({ example: '94105' })
  postalCode?: string;

  @ApiProperty({ example: '2024-01-01T00:00:00.000Z' })
  createdAt: string;
}

export class UpdateUserRequestDto {
  @ApiPropertyOptional({ example: 'John Doe', maxLength: 100 })
  name?: string;

  @ApiPropertyOptional({ example: 'https://example.com/avatar.png' })
  avatarUrl?: string;

  @ApiPropertyOptional({ example: '+14155552671', description: 'E.164 phone format' })
  phone?: string;

  @ApiPropertyOptional({ example: '1990-01-15', description: 'ISO 8601 date (YYYY-MM-DD)' })
  dateOfBirth?: string;

  @ApiPropertyOptional({ example: '123 Main St', maxLength: 200 })
  addressLine?: string;

  @ApiPropertyOptional({ example: 'San Francisco', maxLength: 100 })
  city?: string;

  @ApiPropertyOptional({ example: 'US', description: 'ISO 3166-1 alpha-2 country code' })
  country?: string;

  @ApiPropertyOptional({ example: '94105', maxLength: 20 })
  postalCode?: string;
}
