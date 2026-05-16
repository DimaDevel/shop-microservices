import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ProfileEntity } from './profile.entity';
import { UpdateUserDto } from './users.dto';
import { Role } from '@nest-gateway/shared';

// ─────────────────────────────────────────────────────────────
//  UsersService
//
//  User Service НЕ знает о JWT. Он получает данные пользователя
//  из заголовков которые добавил Gateway:
//    x-user-id    → requesterId
//    x-roles      → requesterRoles
//
//  Бизнес-логика авторизации здесь — не в Gateway.
//  Gateway только аутентифицирует (кто ты?),
//  сервис авторизует (что тебе можно?).
// ─────────────────────────────────────────────────────────────
@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(ProfileEntity)
    private readonly profilesRepo: Repository<ProfileEntity>,
  ) {}

  async findById(
    id: string,
    requesterId: string,
    requesterRoles: Role[],
  ): Promise<ProfileEntity> {
    const profile = await this.profilesRepo.findOne({ where: { id } });

    if (!profile) {
      throw new NotFoundException(`User ${id} not found`);
    }

    // Только сам пользователь или admin может смотреть профиль
    if (requesterId !== id && !requesterRoles.includes(Role.ADMIN)) {
      throw new ForbiddenException('Access denied');
    }

    return profile;
  }

  async update(
    id: string,
    dto: UpdateUserDto,
    requesterId: string,
    requesterRoles: Role[],
  ): Promise<ProfileEntity> {
    const profile = await this.profilesRepo.findOne({ where: { id } });

    if (!profile) {
      throw new NotFoundException(`User ${id} not found`);
    }

    if (requesterId !== id && !requesterRoles.includes(Role.ADMIN)) {
      throw new ForbiddenException('Access denied');
    }

    Object.assign(profile, dto);
    return this.profilesRepo.save(profile);
  }

  async remove(id: string): Promise<void> {
    const result = await this.profilesRepo.delete(id);
    if (result.affected === 0) {
      throw new NotFoundException(`User ${id} not found`);
    }
  }

  // Вызывается когда Auth Service создаёт нового пользователя
  // (через internal event или прямой вызов — для портфолио достаточно REST)
  async createProfile(id: string, email: string): Promise<ProfileEntity> {
    const profile = this.profilesRepo.create({ id, email });
    return this.profilesRepo.save(profile);
  }
}
