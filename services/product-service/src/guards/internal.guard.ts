import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY, HEADERS } from '@nest-gateway/shared';

@Injectable()
export class InternalGuard implements CanActivate {
  constructor(
    private readonly config: ConfigService,
    private readonly reflector: Reflector,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest();
    const secret = request.headers[HEADERS.INTERNAL_SECRET];
    const expected = this.config.getOrThrow<string>('INTERNAL_SECRET');

    if (!secret || secret !== expected) {
      throw new UnauthorizedException('Missing or invalid internal secret');
    }

    return true;
  }
}
