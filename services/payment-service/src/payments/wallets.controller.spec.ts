import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { WalletsController } from './wallets.controller';
import { WalletService } from './wallet.service';
import { UserWalletEntity } from './user-wallet.entity';

const makeWallet = (userId: string, balance: number): UserWalletEntity =>
  ({ id: 'w-1', userId, balance, createdAt: new Date(), updatedAt: new Date() }) as UserWalletEntity;

describe('WalletsController', () => {
  let controller: WalletsController;
  let walletService: { getBalance: jest.Mock; topUp: jest.Mock };
  let dataSource: { transaction: jest.Mock };

  beforeEach(async () => {
    walletService = { getBalance: jest.fn(), topUp: jest.fn() };
    dataSource = {
      transaction: jest.fn().mockImplementation((cb: (manager: unknown) => Promise<unknown>) => cb({})),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WalletsController,
        { provide: WalletService, useValue: walletService },
        { provide: DataSource, useValue: dataSource },
      ],
    }).compile();

    controller = module.get(WalletsController);
  });

  afterEach(() => jest.clearAllMocks());

  describe('getWallet', () => {
    it('returns own wallet when requesterId matches the target userId', async () => {
      walletService.getBalance.mockResolvedValue(makeWallet('user-1', 9_500));

      const result = await controller.getWallet('user-1', 'user-1', 'user');

      expect(result).toEqual({ userId: 'user-1', balance: 9_500 });
    });

    it('allows an admin to read any user wallet', async () => {
      walletService.getBalance.mockResolvedValue(makeWallet('user-2', 3_000));

      const result = await controller.getWallet('user-2', 'admin-1', 'admin');

      expect(result).toEqual({ userId: 'user-2', balance: 3_000 });
    });

    it('throws ForbiddenException when a non-admin requests another user wallet', async () => {
      await expect(controller.getWallet('user-2', 'user-1', 'user')).rejects.toThrow(ForbiddenException);
      expect(walletService.getBalance).not.toHaveBeenCalled();
    });

    it('calls getBalance inside a transaction', async () => {
      walletService.getBalance.mockResolvedValue(makeWallet('user-1', 100));

      await controller.getWallet('user-1', 'user-1', 'user');

      expect(dataSource.transaction).toHaveBeenCalledTimes(1);
      expect(walletService.getBalance).toHaveBeenCalledWith('user-1', {});
    });
  });

  describe('topUp', () => {
    it('tops up wallet and returns updated balance when called by admin', async () => {
      walletService.topUp.mockResolvedValue(makeWallet('user-1', 10_500));

      const result = await controller.topUp('user-1', { amount: 500 }, 'admin');

      expect(result).toEqual({ userId: 'user-1', balance: 10_500 });
      expect(walletService.topUp).toHaveBeenCalledWith('user-1', 500, {});
    });

    it('throws ForbiddenException when a non-admin attempts to top up', async () => {
      await expect(controller.topUp('user-1', { amount: 500 }, 'user')).rejects.toThrow(ForbiddenException);
      expect(walletService.topUp).not.toHaveBeenCalled();
    });

    it('throws ForbiddenException when no role header is present', async () => {
      await expect(controller.topUp('user-1', { amount: 100 }, '')).rejects.toThrow(ForbiddenException);
    });
  });
});
