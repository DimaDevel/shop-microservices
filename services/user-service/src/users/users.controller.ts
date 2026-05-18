import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Headers,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { UpdateUserDto, CreateProfileDto } from './users.dto';
import { UpdateProfileInput } from './users.inputs';
import { HEADERS, Role, Public } from '@nest-gateway/shared';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Public()
  @Get('health')
  health() {
    return { status: 'ok', service: 'user-service' };
  }

  @Post()
  createUser(@Body() dto: CreateProfileDto) {
    return this.usersService.createProfile(dto.id, dto.email);
  }

  @Get(':id')
  getUser(
    @Param('id') id: string,
    @Headers(HEADERS.USER_ID) requesterId: string,
    @Headers(HEADERS.USER_ROLES) rolesHeader: string,
  ) {
    return this.usersService.findById(id, requesterId, this.parseRoles(rolesHeader));
  }

  @Patch(':id')
  updateUser(
    @Param('id') id: string,
    @Body() dto: UpdateUserDto,
    @Headers(HEADERS.USER_ID) requesterId: string,
    @Headers(HEADERS.USER_ROLES) rolesHeader: string,
  ) {
    const input: UpdateProfileInput = { name: dto.name, avatarUrl: dto.avatarUrl };
    return this.usersService.update(id, input, requesterId, this.parseRoles(rolesHeader));
  }

  @Delete(':id')
  deleteUser(
    @Param('id') id: string,
    @Headers(HEADERS.USER_ROLES) rolesHeader: string,
  ) {
    return this.usersService.remove(id, this.parseRoles(rolesHeader));
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
