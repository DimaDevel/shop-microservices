import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import { Role } from '../constants';
import { RequestUser } from '../interfaces';

// ─────────────────────────────────────────────────────────────
//  @CurrentUser()
//  Param decorator — вытаскивает req.user в параметр метода
//
//  Использование:
//    async getProfile(@CurrentUser() user: RequestUser) { ... }
// ─────────────────────────────────────────────────────────────
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): RequestUser => {
    const request = ctx.switchToHttp().getRequest();
    return request.user;
  },
);

// ─────────────────────────────────────────────────────────────
//  @Roles(...roles)
//  Metadata decorator — используется совместно с RolesGuard
//
//  Использование:
//    @Roles(Role.ADMIN)
//    async deleteUser() { ... }
// ─────────────────────────────────────────────────────────────
export const ROLES_KEY = 'roles';
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);

// ─────────────────────────────────────────────────────────────
//  @Public()
//  Помечает роут как публичный — JwtAuthGuard его пропустит
//
//  Использование:
//    @Public()
//    @Post('login')
//    async login() { ... }
// ─────────────────────────────────────────────────────────────
export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
