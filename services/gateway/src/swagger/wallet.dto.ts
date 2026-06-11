import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, Min } from 'class-validator';

export class WalletDto {
  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440000' })
  userId: string;

  @ApiProperty({ example: 10000 })
  balance: number;
}

export class TopUpWalletRequestDto {
  @ApiProperty({ example: 500, minimum: 0.01, description: 'Amount to add to the wallet' })
  @IsNumber()
  @Min(0.01)
  amount: number;
}
