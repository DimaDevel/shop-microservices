import { Test, TestingModule } from '@nestjs/testing';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { UpdateUserDto } from './users.dto';
import { ProfileResult } from './users.outputs';
import { Role } from '@nest-gateway/shared';

const now = new Date();

const mockProfile: ProfileResult = {
  id: 'uuid-1',
  email: 'user@example.com',
  name: 'Test User',
  isActive: true,
  createdAt: now,
  updatedAt: now,
};

describe('UsersController', () => {
  let controller: UsersController;
  let usersService: jest.Mocked<UsersService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [
        {
          provide: UsersService,
          useValue: {
            findById: jest.fn(),
            update: jest.fn(),
            remove: jest.fn(),
            createProfile: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get(UsersController);
    usersService = module.get(UsersService);
  });

  describe('health', () => {
    it('returns ok status', () => {
      expect(controller.health()).toEqual({ status: 'ok', service: 'user-service' });
    });
  });

  describe('getUser', () => {
    it('passes parsed roles to service.findById', async () => {
      usersService.findById.mockResolvedValue(mockProfile);

      await controller.getUser('uuid-1', 'uuid-1', 'user,admin');

      expect(usersService.findById).toHaveBeenCalledWith('uuid-1', 'uuid-1', [Role.USER, Role.ADMIN]);
    });

    it('filters out invalid role values', async () => {
      usersService.findById.mockResolvedValue(mockProfile);

      await controller.getUser('uuid-1', 'uuid-1', 'user,not-a-role');

      expect(usersService.findById).toHaveBeenCalledWith('uuid-1', 'uuid-1', [Role.USER]);
    });

    it('passes empty array when roles header is absent', async () => {
      usersService.findById.mockResolvedValue(mockProfile);

      await controller.getUser('uuid-1', 'uuid-1', undefined as unknown as string);

      expect(usersService.findById).toHaveBeenCalledWith('uuid-1', 'uuid-1', []);
    });
  });

  describe('updateUser', () => {
    it('maps basic dto fields to input and delegates to service.update', async () => {
      usersService.update.mockResolvedValue(mockProfile);
      const dto: UpdateUserDto = { name: 'New Name' };

      await controller.updateUser('uuid-1', dto, 'uuid-1', 'user');

      expect(usersService.update).toHaveBeenCalledWith(
        'uuid-1',
        expect.objectContaining({ name: 'New Name' }),
        'uuid-1',
        [Role.USER],
      );
    });

    it('maps extended profile fields (phone, dateOfBirth, address) to input', async () => {
      usersService.update.mockResolvedValue(mockProfile);
      const dto: UpdateUserDto = {
        phone: '+380501234567',
        dateOfBirth: '1990-05-15',
        addressLine: '123 Main St',
        city: 'Kyiv',
        country: 'UA',
        postalCode: '01001',
      };

      await controller.updateUser('uuid-1', dto, 'uuid-1', 'user');

      expect(usersService.update).toHaveBeenCalledWith(
        'uuid-1',
        expect.objectContaining({
          phone: '+380501234567',
          dateOfBirth: '1990-05-15',
          addressLine: '123 Main St',
          city: 'Kyiv',
          country: 'UA',
          postalCode: '01001',
        }),
        'uuid-1',
        [Role.USER],
      );
    });
  });

  describe('deleteUser', () => {
    it('delegates to service.remove with parsed roles', async () => {
      usersService.remove.mockResolvedValue(undefined);

      await controller.deleteUser('uuid-1', 'admin');

      expect(usersService.remove).toHaveBeenCalledWith('uuid-1', [Role.ADMIN]);
    });
  });
});
