import {
  Controller, Get, Patch, Delete,
  Param, Body, Headers,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { UpdateUserDto } from './users.dto';
import { HEADERS, Role } from '@nest-gateway/shared';

// ─────────────────────────────────────────────────────────────
//  UsersController
//
//  Читает x-user-id и x-roles из заголовков — они проставлены
//  Gateway после валидации JWT. Никакого passport/jwt здесь нет.
// ─────────────────────────────────────────────────────────────
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get(':id')
  getUser(
    @Param('id') id: string,
    @Headers(HEADERS.USER_ID) requesterId: string,
    @Headers(HEADERS.USER_ROLES) rolesHeader: string,
  ) {
    const roles = this.parseRoles(rolesHeader);
    return this.usersService.findById(id, requesterId, roles);
  }

  @Patch(':id')
  updateUser(
    @Param('id') id: string,
    @Body() dto: UpdateUserDto,
    @Headers(HEADERS.USER_ID) requesterId: string,
    @Headers(HEADERS.USER_ROLES) rolesHeader: string,
  ) {
    const roles = this.parseRoles(rolesHeader);
    return this.usersService.update(id, dto, requesterId, roles);
  }

  @Delete(':id')
  deleteUser(
    @Param('id') id: string,
    @Headers(HEADERS.USER_ID) requesterId: string,
    @Headers(HEADERS.USER_ROLES) rolesHeader: string,
  ) {
    const roles = this.parseRoles(rolesHeader);
    // Дополнительная проверка — только ADMIN
    if (!roles.includes(Role.ADMIN)) {
      throw new Error('Only admins can delete users');
    }
    return this.usersService.remove(id);
  }

  @Get('health')
  health() {
    return { status: 'ok', service: 'user-service' };
  }

  private parseRoles(rolesHeader: string): Role[] {
    if (!rolesHeader) return [];
    return rolesHeader.split(',').map((r) => r.trim() as Role);
  }
}
