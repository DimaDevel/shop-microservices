import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { UsersService } from './users.service';
import { ProfileEntity } from './profile.entity';
import { Role } from '@nest-gateway/shared';

const now = new Date();

const makeProfile = (overrides: Partial<ProfileEntity> = {}): ProfileEntity =>
  ({
    id: 'uuid-1',
    email: 'user@example.com',
    name: 'Test User',
    avatarUrl: null,
    isActive: true,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  }) as ProfileEntity;

describe('UsersService', () => {
  let service: UsersService;
  let profilesRepo: Record<string, jest.Mock>;

  beforeEach(async () => {
    profilesRepo = {
      findOne: jest.fn(),
      save: jest.fn(),
      create: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [UsersService, { provide: getRepositoryToken(ProfileEntity), useValue: profilesRepo }],
    }).compile();

    service = module.get(UsersService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('findById', () => {
    it('returns profile when requester is the owner', async () => {
      const profile = makeProfile();
      profilesRepo.findOne.mockResolvedValue(profile);

      const result = await service.findById('uuid-1', 'uuid-1', [Role.USER]);

      expect(result).toMatchObject({ id: 'uuid-1', email: 'user@example.com' });
    });

    it('returns profile when requester is an admin', async () => {
      const profile = makeProfile();
      profilesRepo.findOne.mockResolvedValue(profile);

      const result = await service.findById('uuid-1', 'admin-uuid', [Role.ADMIN]);

      expect(result).toMatchObject({ id: 'uuid-1' });
    });

    it('throws NotFoundException when profile does not exist', async () => {
      profilesRepo.findOne.mockResolvedValue(null);

      await expect(service.findById('missing', 'missing', [])).rejects.toThrow(NotFoundException);
    });

    it('throws ForbiddenException when non-admin accesses another user', async () => {
      profilesRepo.findOne.mockResolvedValue(makeProfile());

      await expect(service.findById('uuid-1', 'other-uuid', [Role.USER])).rejects.toThrow(ForbiddenException);
    });
  });

  describe('update', () => {
    it('updates and returns profile when requester is the owner', async () => {
      const profile = makeProfile();
      const updated = { ...profile, name: 'New Name' };
      profilesRepo.findOne.mockResolvedValue(profile);
      profilesRepo.save.mockResolvedValue(updated);

      const result = await service.update('uuid-1', { name: 'New Name' }, 'uuid-1', [Role.USER]);

      expect(profilesRepo.save).toHaveBeenCalled();
      expect(result.name).toBe('New Name');
    });

    it('updates when requester is an admin', async () => {
      const profile = makeProfile();
      profilesRepo.findOne.mockResolvedValue(profile);
      profilesRepo.save.mockResolvedValue({ ...profile, avatarUrl: 'https://example.com/a.png' });

      const result = await service.update('uuid-1', { avatarUrl: 'https://example.com/a.png' }, 'admin-uuid', [
        Role.ADMIN,
      ]);

      expect(result.avatarUrl).toBe('https://example.com/a.png');
    });

    it('throws NotFoundException when profile does not exist', async () => {
      profilesRepo.findOne.mockResolvedValue(null);

      await expect(service.update('missing', { name: 'X' }, 'missing', [])).rejects.toThrow(NotFoundException);
    });

    it('throws ForbiddenException when non-admin updates another user', async () => {
      profilesRepo.findOne.mockResolvedValue(makeProfile());

      await expect(service.update('uuid-1', { name: 'X' }, 'other-uuid', [Role.USER])).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('remove', () => {
    it('soft-deletes profile when requester is an admin', async () => {
      const profile = makeProfile();
      profilesRepo.findOne.mockResolvedValue(profile);
      profilesRepo.save.mockResolvedValue({ ...profile, isActive: false });

      await service.remove('uuid-1', [Role.ADMIN]);

      expect(profilesRepo.save).toHaveBeenCalledWith(expect.objectContaining({ isActive: false }));
    });

    it('throws ForbiddenException when requester is not an admin', async () => {
      await expect(service.remove('uuid-1', [Role.USER])).rejects.toThrow(ForbiddenException);
    });

    it('throws NotFoundException when profile does not exist', async () => {
      profilesRepo.findOne.mockResolvedValue(null);

      await expect(service.remove('missing', [Role.ADMIN])).rejects.toThrow(NotFoundException);
    });
  });

  describe('createProfile', () => {
    it('creates and returns a new profile', async () => {
      const profile = makeProfile();
      profilesRepo.create.mockReturnValue(profile);
      profilesRepo.save.mockResolvedValue(profile);

      const result = await service.createProfile('uuid-1', 'user@example.com');

      expect(profilesRepo.create).toHaveBeenCalledWith({ id: 'uuid-1', email: 'user@example.com' });
      expect(result).toMatchObject({ id: 'uuid-1', email: 'user@example.com' });
    });
  });
});
