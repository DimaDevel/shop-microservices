import { Injectable, Inject, Logger } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { JwtPayload, RequestUser } from '@nest-gateway/shared';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  private readonly logger = new Logger(JwtStrategy.name);

  constructor(
    config: ConfigService,
    @Inject(CACHE_MANAGER) private readonly cache: Cache,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>('JWT_SECRET'),
    });
  }

  async validate(payload: JwtPayload): Promise<RequestUser> {
    const key = `jwt:${payload.sub}:${payload.iat}`;

    try {
      const cached = await this.cache.get<RequestUser>(key);
      if (cached) return cached;
    } catch (err: unknown) {
      this.logger.warn(`Redis cache read failed for key ${key}: ${(err as Error).message}`);
    }

    const user: RequestUser = {
      id: payload.sub,
      email: payload.email,
      roles: payload.roles ?? [],
    };

    const ttlMs = ((payload.exp ?? 0) - Math.floor(Date.now() / 1000)) * 1000;
    if (ttlMs > 0) {
      try {
        await this.cache.set(key, user, ttlMs);
      } catch (err: unknown) {
        this.logger.warn(`Redis cache write failed for key ${key}: ${(err as Error).message}`);
      }
    }

    return user;
  }
}
