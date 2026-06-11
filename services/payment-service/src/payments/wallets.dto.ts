import { IsNumber, Min } from 'class-validator';

export class TopUpWalletDto {
  @IsNumber()
  @Min(0.01)
  amount: number;
}
