import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { JwtPayload, RequestUser } from '@nest-gateway/shared';

// ─────────────────────────────────────────────────────────────
//  JwtStrategy
//
//  Passport стратегия для проверки JWT.
//  Вызывается автоматически когда JwtAuthGuard активируется.
//
//  validate() получает уже декодированный payload (подпись проверена).
//  Что возвращает validate() — то и попадает в req.user.
// ─────────────────────────────────────────────────────────────
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(config: ConfigService) {
    super({
      // Берём токен из заголовка Authorization: Bearer <token>
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      // ignoreExpiration: false — истёкшие токены отклоняются
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>('JWT_SECRET'),
    });
  }

  // Payload уже верифицирован — строим объект пользователя
  validate(payload: JwtPayload): RequestUser {
    return {
      id: payload.sub,
      email: payload.email,
      roles: payload.roles ?? [],
    };
  }
}
