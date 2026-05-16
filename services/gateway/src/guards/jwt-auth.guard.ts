import {
  Injectable,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { IS_PUBLIC_KEY } from '@nest-gateway/shared';

// ─────────────────────────────────────────────────────────────
//  JwtAuthGuard
//
//  Расширяет стандартный PassportJS AuthGuard('jwt').
//  Добавляет поддержку @Public() — если роут помечен,
//  Guard пропускает запрос без проверки токена.
//
//  После успешной проверки Passport кладёт payload в req.user.
//  JwtStrategy (ниже) определяет что именно туда попадёт.
// ─────────────────────────────────────────────────────────────
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private reflector: Reflector) {
    super();
  }

  canActivate(context: ExecutionContext) {
    // Reflector читает метаданные с декоратора @Public()
    // Проверяем на уровне метода И на уровне класса
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true; // пропускаем без JWT
    }

    // Делегируем стандартной логике PassportJS
    return super.canActivate(context);
  }

  // Кастомизируем сообщение об ошибке
  handleRequest(err: Error, user: unknown) {
    if (err || !user) {
      throw new UnauthorizedException('Invalid or missing token');
    }
    return user;
  }
}
