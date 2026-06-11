import { Body, Controller, Get, Param, Post, Req, Res } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiParam, ApiBody, ApiResponse } from '@nestjs/swagger';
import { FastifyRequest, FastifyReply } from 'fastify';
import { CurrentUser, RequestUser, Role, Roles } from '@nest-gateway/shared';
import { ProxyService } from './proxy.service';
import { TopUpWalletRequestDto, WalletDto } from '../../swagger/wallet.dto';
import { ApiErrorDto } from '../../swagger/common.dto';

@ApiTags('Payments')
@ApiBearerAuth()
@Controller('payments')
export class PaymentsProxyController {
  constructor(private readonly proxy: ProxyService) {}

  @Get('wallet/me')
  @ApiOperation({ summary: 'Get own wallet balance' })
  @ApiResponse({ status: 200, description: 'Own wallet balance', type: WalletDto })
  @ApiResponse({ status: 401, description: 'Unauthorized', type: ApiErrorDto })
  async getMyWallet(
    @CurrentUser() user: RequestUser,
    @Req() req: FastifyRequest & { correlationId?: string },
    @Res() res: FastifyReply,
  ) {
    const { status, data } = await this.proxy.proxyToPayments({
      method: 'GET',
      path: `/wallets/${user.id}`,
      user,
      correlationId: req.correlationId,
    });
    return res.status(status).send(data);
  }

  @Get('wallet/:userId')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Get wallet balance by user ID (Admin only)' })
  @ApiParam({ name: 'userId', description: 'User UUID' })
  @ApiResponse({ status: 200, description: 'Wallet balance', type: WalletDto })
  @ApiResponse({ status: 403, description: 'Forbidden — admin role required', type: ApiErrorDto })
  @ApiResponse({ status: 404, description: 'Wallet not found', type: ApiErrorDto })
  async getWallet(
    @Param('userId') userId: string,
    @CurrentUser() user: RequestUser,
    @Req() req: FastifyRequest & { correlationId?: string },
    @Res() res: FastifyReply,
  ) {
    const { status, data } = await this.proxy.proxyToPayments({
      method: 'GET',
      path: `/wallets/${userId}`,
      user,
      correlationId: req.correlationId,
    });
    return res.status(status).send(data);
  }

  @Post('wallet/:userId/top-up')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Top up a user wallet (Admin only)' })
  @ApiParam({ name: 'userId', description: 'User UUID' })
  @ApiBody({ type: TopUpWalletRequestDto })
  @ApiResponse({ status: 201, description: 'Wallet topped up', type: WalletDto })
  @ApiResponse({ status: 403, description: 'Forbidden — admin role required', type: ApiErrorDto })
  async topUp(
    @Param('userId') userId: string,
    @Body() body: TopUpWalletRequestDto,
    @CurrentUser() user: RequestUser,
    @Req() req: FastifyRequest & { correlationId?: string },
    @Res() res: FastifyReply,
  ) {
    const { status, data } = await this.proxy.proxyToPayments({
      method: 'POST',
      path: `/wallets/${userId}/top-up`,
      body,
      user,
      correlationId: req.correlationId,
    });
    return res.status(status).send(data);
  }
}
