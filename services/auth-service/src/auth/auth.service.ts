import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { UserEntity } from '../users/user.entity';
import { JwtPayload, Role } from '@nest-gateway/shared';
import { LoginDto, RegisterDto, TokensResponseDto } from './auth.dto';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @InjectRepository(UserEntity)
    private readonly usersRepo: Repository<UserEntity>,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
  ) {}

  async register(dto: RegisterDto): Promise<TokensResponseDto> {
    const exists = await this.usersRepo.findOne({
      where: { email: dto.email },
    });

    if (exists) {
      throw new ConflictException('Email already registered');
    }

    const user = this.usersRepo.create({
      email: dto.email,
      passwordHash: dto.password, // @BeforeInsert() захеширует
      roles: [Role.USER],
    });

    await this.usersRepo.save(user);
    this.logger.log(`New user registered: ${user.email}`);

    return this.issueTokens(user);
  }

  async login(dto: LoginDto): Promise<TokensResponseDto> {
    // select: false на passwordHash — нужно явно указать
    const user = await this.usersRepo
      .createQueryBuilder('user')
      .addSelect('user.passwordHash')
      .where('user.email = :email', { email: dto.email })
      .andWhere('user.isActive = true')
      .getOne();

    if (!user || !(await user.validatePassword(dto.password))) {
      // Одинаковое сообщение для обоих случаев — не раскрываем существование email
      throw new UnauthorizedException('Invalid credentials');
    }

    this.logger.log(`User logged in: ${user.email}`);
    return this.issueTokens(user);
  }

  async refresh(refreshToken: string): Promise<TokensResponseDto> {
    let payload: JwtPayload;

    try {
      payload = this.jwtService.verify<JwtPayload>(refreshToken, {
        secret: this.config.getOrThrow('JWT_REFRESH_SECRET'),
      });
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const user = await this.usersRepo.findOne({
      where: { id: payload.sub, refreshToken, isActive: true },
    });

    if (!user) {
      throw new UnauthorizedException('Refresh token revoked');
    }

    return this.issueTokens(user);
  }

  private async issueTokens(user: UserEntity): Promise<TokensResponseDto> {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      roles: user.roles,
    };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload),
      this.jwtService.signAsync(payload, {
        secret: this.config.getOrThrow('JWT_REFRESH_SECRET'),
        expiresIn: '7d',
      }),
    ]);

    // Сохраняем refresh token в БД (rotation pattern)
    await this.usersRepo.update(user.id, { refreshToken });

    return {
      accessToken,
      refreshToken,
      expiresIn: 3600,
    };
  }
}
