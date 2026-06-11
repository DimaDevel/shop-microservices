import { Body, Controller, ForbiddenException, Get, Param, Post } from '@nestjs/common';
import { Headers } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { HEADERS, Role } from '@nest-gateway/shared';
import { WalletService } from './wallet.service';
import { TopUpWalletDto } from './wallets.dto';

@Controller('wallets')
export class WalletsController {
  constructor(
    private readonly walletService: WalletService,
    private readonly dataSource: DataSource,
  ) {}

  @Get(':userId')
  async getWallet(
    @Param('userId') userId: string,
    @Headers(HEADERS.USER_ID) requesterId: string,
    @Headers(HEADERS.USER_ROLES) rolesHeader: string,
  ) {
    const roles = this.parseRoles(rolesHeader);
    if (requesterId !== userId && !roles.includes(Role.ADMIN)) {
      throw new ForbiddenException('Access denied');
    }
    const wallet = await this.dataSource.transaction((manager) =>
      this.walletService.getBalance(userId, manager),
    );
    return { userId: wallet.userId, balance: Number(wallet.balance) };
  }

  @Post(':userId/top-up')
  async topUp(
    @Param('userId') userId: string,
    @Body() dto: TopUpWalletDto,
    @Headers(HEADERS.USER_ROLES) rolesHeader: string,
  ) {
    const roles = this.parseRoles(rolesHeader);
    if (!roles.includes(Role.ADMIN)) {
      throw new ForbiddenException('Admin role required');
    }
    const wallet = await this.dataSource.transaction((manager) =>
      this.walletService.topUp(userId, dto.amount, manager),
    );
    return { userId: wallet.userId, balance: Number(wallet.balance) };
  }

  private parseRoles(rolesHeader: string): Role[] {
    if (!rolesHeader) return [];
    const valid = new Set(Object.values(Role));
    return rolesHeader
      .split(',')
      .map((r) => r.trim() as Role)
      .filter((r) => valid.has(r));
  }
}
