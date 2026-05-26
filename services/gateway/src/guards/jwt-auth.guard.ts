import { Injectable, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { IS_PUBLIC_KEY } from '@nest-gateway/shared';

// ─────────────────────────────────────────────────────────────
//  JwtAuthGuard
//
//  Extends the standard PassportJS AuthGuard('jwt').
//  Adds support for @Public() — if a route is marked,
//  the guard lets the request through without verifying a token.
//
//  On successful verification Passport populates req.user with the payload.
//  JwtStrategy defines exactly what is placed there.
// ─────────────────────────────────────────────────────────────
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private reflector: Reflector) {
    super();
  }

  canActivate(context: ExecutionContext) {
    // Reflector reads metadata from the @Public() decorator
    // Check at method level AND at class level
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true; // skip JWT check
    }

    // Delegate to the standard PassportJS logic
    return super.canActivate(context);
  }

  // Customize the error message
  handleRequest<TUser>(err: Error, user: TUser): TUser {
    if (err || !user) {
      throw new UnauthorizedException('Invalid or missing token');
    }
    return user;
  }
}
