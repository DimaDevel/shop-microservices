import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ProfileEntity } from './profile.entity';
import { FindAllUsersInput, UpdateProfileInput } from './users.inputs';
import { ProfileResult } from './users.outputs';
import { PaginatedResult } from '@nest-gateway/shared';
import { Role } from '@nest-gateway/shared';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(ProfileEntity)
    private readonly profilesRepo: Repository<ProfileEntity>,
  ) {}

  async findAll(input: FindAllUsersInput, requesterRoles: Role[]): Promise<PaginatedResult<ProfileResult>> {
    if (!requesterRoles.includes(Role.ADMIN)) {
      throw new ForbiddenException('Only admins can list users');
    }
    const { page, limit } = input;
    const [profiles, total] = await this.profilesRepo.findAndCount({
      where: { isActive: true },
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return {
      data: profiles.map(this.toResult),
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async findById(id: string, requesterId: string, requesterRoles: Role[]): Promise<ProfileResult> {
    const profile = await this.profilesRepo.findOne({ where: { id, isActive: true } });

    if (!profile) {
      throw new NotFoundException(`User ${id} not found`);
    }

    if (requesterId !== id && !requesterRoles.includes(Role.ADMIN)) {
      throw new ForbiddenException('Access denied');
    }

    return this.toResult(profile);
  }

  async update(
    id: string,
    input: UpdateProfileInput,
    requesterId: string,
    requesterRoles: Role[],
  ): Promise<ProfileResult> {
    const profile = await this.profilesRepo.findOne({ where: { id, isActive: true } });

    if (!profile) {
      throw new NotFoundException(`User ${id} not found`);
    }

    if (requesterId !== id && !requesterRoles.includes(Role.ADMIN)) {
      throw new ForbiddenException('Access denied');
    }

    const defined = Object.fromEntries(Object.entries(input).filter(([, v]) => v !== undefined));
    return this.toResult(await this.profilesRepo.save({ ...profile, ...defined }));
  }

  async remove(id: string, requesterRoles: Role[]): Promise<void> {
    if (!requesterRoles.includes(Role.ADMIN)) {
      throw new ForbiddenException('Only admins can delete users');
    }

    const profile = await this.profilesRepo.findOne({ where: { id } });
    if (!profile) {
      throw new NotFoundException(`User ${id} not found`);
    }

    profile.isActive = false;
    await this.profilesRepo.save(profile);
  }

  async createProfile(id: string, email: string): Promise<ProfileResult> {
    const existing = await this.profilesRepo.findOne({ where: { id } });
    if (existing) return this.toResult(existing);
    const profile = this.profilesRepo.create({ id, email });
    return this.toResult(await this.profilesRepo.save(profile));
  }

  private toResult(profile: ProfileEntity): ProfileResult {
    return {
      id: profile.id,
      email: profile.email,
      name: profile.name,
      avatarUrl: profile.avatarUrl,
      phone: profile.phone,
      dateOfBirth: profile.dateOfBirth,
      addressLine: profile.addressLine,
      city: profile.city,
      country: profile.country,
      postalCode: profile.postalCode,
      isActive: profile.isActive,
      createdAt: profile.createdAt,
      updatedAt: profile.updatedAt,
    };
  }
}
