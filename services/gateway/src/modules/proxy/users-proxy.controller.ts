import { Controller, Get, Patch, Delete, Param, Body, Req, Res, HttpCode } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiParam, ApiBody, ApiResponse } from '@nestjs/swagger';
import { FastifyRequest, FastifyReply } from 'fastify';
import { CurrentUser, Roles, Role, RequestUser } from '@nest-gateway/shared';
import { ProxyService } from './proxy.service';
import { UserProfileDto, UpdateUserRequestDto } from '../../swagger/user.dto';
import { ApiErrorDto } from '../../swagger/common.dto';

@ApiTags('Users')
@ApiBearerAuth()
@Controller('users')
export class UsersProxyController {
  constructor(private readonly proxy: ProxyService) {}

  @Get('me')
  @ApiOperation({ summary: 'Get own profile' })
  @ApiResponse({ status: 200, description: 'Own user profile', type: UserProfileDto })
  async getMe(
    @CurrentUser() user: RequestUser,
    @Req() req: FastifyRequest & { correlationId?: string },
    @Res() res: FastifyReply,
  ) {
    const { status, data } = await this.proxy.proxyToUsers({
      method: 'GET',
      path: `/users/${user.id}`,
      user,
      correlationId: req.correlationId,
    });
    return res.status(status).send(data);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a user profile by ID' })
  @ApiParam({ name: 'id', description: 'User UUID' })
  @ApiResponse({ status: 200, description: 'User profile', type: UserProfileDto })
  @ApiResponse({ status: 404, description: 'User not found', type: ApiErrorDto })
  async getUser(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
    @Req() req: FastifyRequest & { correlationId?: string },
    @Res() res: FastifyReply,
  ) {
    const { status, data } = await this.proxy.proxyToUsers({
      method: 'GET',
      path: `/users/${id}`,
      user,
      correlationId: req.correlationId,
    });

    return res.status(status).send(data);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a user profile', description: 'Any authenticated user may update their own profile. All fields are optional.' })
  @ApiParam({ name: 'id', description: 'User UUID' })
  @ApiBody({ type: UpdateUserRequestDto })
  @ApiResponse({ status: 200, description: 'Updated user profile', type: UserProfileDto })
  @ApiResponse({ status: 404, description: 'User not found', type: ApiErrorDto })
  async updateUser(
    @Param('id') id: string,
    @Body() body: unknown,
    @CurrentUser() user: RequestUser,
    @Req() req: FastifyRequest & { correlationId?: string },
    @Res() res: FastifyReply,
  ) {
    const { status, data } = await this.proxy.proxyToUsers({
      method: 'PATCH',
      path: `/users/${id}`,
      body,
      user,
      correlationId: req.correlationId,
    });

    return res.status(status).send(data);
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Delete a user (Admin only)', description: 'Requires the `admin` role.' })
  @ApiParam({ name: 'id', description: 'User UUID' })
  @ApiResponse({ status: 200, description: 'User deleted' })
  @ApiResponse({ status: 403, description: 'Forbidden — admin role required', type: ApiErrorDto })
  @ApiResponse({ status: 404, description: 'User not found', type: ApiErrorDto })
  async deleteUser(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
    @Req() req: FastifyRequest & { correlationId?: string },
    @Res() res: FastifyReply,
  ) {
    const { status, data } = await this.proxy.proxyToUsers({
      method: 'DELETE',
      path: `/users/${id}`,
      user,
      correlationId: req.correlationId,
    });

    return res.status(status).send(data);
  }
}
