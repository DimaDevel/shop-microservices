import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY, Role, RequestUser } from '@nest-gateway/shared';

// ─────────────────────────────────────────────────────────────
//  RolesGuard
//
//  Works in tandem with the @Roles(...roles) decorator.
//  Runs AFTER JwtAuthGuard — req.user is already populated.
//
//  If a route has no @Roles() metadata — allows all authenticated users.
//  If it does — verifies the user has the required role.
//
//  Example:
//    @Roles(Role.ADMIN)
//    @Get('admin/stats')
//    getStats() { ... }
// ─────────────────────────────────────────────────────────────
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    // No @Roles() metadata — route is open to all authenticated users
    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user: RequestUser = request.user;

    const hasRole = requiredRoles.some((role) => user?.roles?.includes(role));

    if (!hasRole) {
      throw new ForbiddenException(`Access denied. Required roles: ${requiredRoles.join(', ')}`);
    }

    return true;
  }
}
