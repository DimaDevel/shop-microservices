import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import { Role } from '../constants';
import { RequestUser } from '../interfaces';

// ─────────────────────────────────────────────────────────────
//  @CurrentUser()
//  Param decorator — extracts req.user into a method parameter
//
//  Usage:
//    async getProfile(@CurrentUser() user: RequestUser) { ... }
// ─────────────────────────────────────────────────────────────
export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext): RequestUser => {
  const request = ctx.switchToHttp().getRequest();
  return request.user;
});

// ─────────────────────────────────────────────────────────────
//  @Roles(...roles)
//  Metadata decorator — used together with RolesGuard
//
//  Usage:
//    @Roles(Role.ADMIN)
//    async deleteUser() { ... }
// ─────────────────────────────────────────────────────────────
export const ROLES_KEY = 'roles';
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);

// ─────────────────────────────────────────────────────────────
//  @Public()
//  Marks a route as public — JwtAuthGuard will skip it
//
//  Usage:
//    @Public()
//    @Post('login')
//    async login() { ... }
// ─────────────────────────────────────────────────────────────
export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
