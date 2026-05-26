import { Injectable, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'crypto';
import * as bcrypt from 'bcrypt';
import { UserEntity } from '../users/user.entity';
import { JwtPayload, Role } from '@nest-gateway/shared';
import { LoginInput, RegisterInput } from './auth.inputs';
import { TokensResult } from './auth.outputs';
import {
  EmailAlreadyTakenError,
  InvalidCredentialsError,
  InvalidRefreshTokenError,
  RefreshTokenRevokedError,
} from './auth.errors';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @InjectRepository(UserEntity)
    private readonly usersRepo: Repository<UserEntity>,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
  ) {}

  async register(input: RegisterInput): Promise<TokensResult> {
    const exists = await this.usersRepo.findOne({ where: { email: input.email } });
    if (exists) {
      throw new EmailAlreadyTakenError();
    }

    const passwordHash = await bcrypt.hash(input.password, 12);
    const user = this.usersRepo.create({
      email: input.email,
      passwordHash,
      roles: [Role.USER],
    });

    await this.usersRepo.save(user);
    this.logger.log(`New user registered: ${user.email}`);

    return this.issueTokens(user);
  }

  async login(input: LoginInput): Promise<TokensResult> {
    // select: false on passwordHash — must be explicit
    const user = await this.usersRepo
      .createQueryBuilder('user')
      .addSelect('user.passwordHash')
      .where('user.email = :email', { email: input.email })
      .andWhere('user.isActive = true')
      .getOne();

    if (!user || !(await bcrypt.compare(input.password, user.passwordHash))) {
      throw new InvalidCredentialsError();
    }

    this.logger.log(`User logged in: ${user.email}`);
    return this.issueTokens(user);
  }

  async refresh(refreshToken: string): Promise<TokensResult> {
    let payload: JwtPayload;

    try {
      payload = this.jwtService.verify<JwtPayload>(refreshToken, {
        secret: this.config.getOrThrow('JWT_REFRESH_SECRET'),
      });
    } catch {
      throw new InvalidRefreshTokenError();
    }

    const user = await this.usersRepo.findOne({
      where: { id: payload.sub, refreshToken: this.hashToken(refreshToken), isActive: true },
    });

    if (!user) {
      throw new RefreshTokenRevokedError();
    }

    return this.issueTokens(user);
  }

  async logout(userId: string): Promise<{ message: string }> {
    await this.usersRepo.update(userId, { refreshToken: null });
    return { message: 'Logged out successfully' };
  }

  private async issueTokens(user: UserEntity): Promise<TokensResult> {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      roles: user.roles,
    };

    const accessExpiresIn = this.config.getOrThrow<number>('JWT_ACCESS_EXPIRES_IN', 3600);
    const refreshExpiresIn = this.config.getOrThrow<number>('JWT_REFRESH_EXPIRES_IN', 604800);

    let accessToken: string;
    let refreshToken: string;
    try {
      [accessToken, refreshToken] = await Promise.all([
        this.jwtService.signAsync(payload),
        this.jwtService.signAsync(payload, {
          secret: this.config.getOrThrow('JWT_REFRESH_SECRET'),
          expiresIn: refreshExpiresIn,
        }),
      ]);
    } catch (err) {
      this.logger.error(`Failed to sign tokens for user ${user.id}: ${(err as Error).message}`);
      throw err;
    }

    await this.usersRepo.update(user.id, { refreshToken: this.hashToken(refreshToken) });

    return {
      accessToken,
      refreshToken,
      expiresIn: accessExpiresIn,
      userId: user.id,
      email: user.email,
    };
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}
