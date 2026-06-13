import { EntityManager } from 'typeorm';
import { WalletService } from './wallet.service';
import { UserWalletEntity } from './user-wallet.entity';
import { InsufficientFundsError } from './payments.errors';

const makeWallet = (balance: number): UserWalletEntity =>
  ({ id: 'wallet-1', userId: 'user-1', balance, createdAt: new Date(), updatedAt: new Date() }) as UserWalletEntity;

const makeManager = () => {
  const mockQb = {
    setLock: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    getOne: jest.fn(),
  };
  const mockRepo = {
    findOne: jest.fn(),
    save: jest.fn(),
    create: jest.fn().mockImplementation((d) => d),
    createQueryBuilder: jest.fn().mockReturnValue(mockQb),
  };
  return {
    getRepository: jest.fn().mockReturnValue(mockRepo),
    _repo: mockRepo,
    _qb: mockQb,
  };
};

describe('WalletService', () => {
  let service: WalletService;

  beforeEach(() => {
    service = new WalletService();
  });

  afterEach(() => jest.clearAllMocks());

  describe('findOrCreate', () => {
    it('returns existing wallet without creating a new one', async () => {
      const manager = makeManager();
      const existing = makeWallet(500);
      manager._repo.findOne.mockResolvedValue(existing);

      const result = await service.findOrCreate('user-1', 10_000, manager as unknown as EntityManager);

      expect(result).toBe(existing);
      expect(manager._repo.save).not.toHaveBeenCalled();
    });

    it('creates and saves a new wallet with the given initial balance when none exists', async () => {
      const manager = makeManager();
      const created = makeWallet(10_000);
      manager._repo.findOne.mockResolvedValue(null);
      manager._repo.save.mockResolvedValue(created);

      const result = await service.findOrCreate('user-1', 10_000, manager as unknown as EntityManager);

      expect(manager._repo.create).toHaveBeenCalledWith({ userId: 'user-1', balance: 10_000 });
      expect(manager._repo.save).toHaveBeenCalledTimes(1);
      expect(result).toBe(created);
    });
  });

  describe('getBalance', () => {
    it('returns the wallet when it exists', async () => {
      const manager = makeManager();
      const wallet = makeWallet(300);
      manager._repo.findOne.mockResolvedValue(wallet);

      const result = await service.getBalance('user-1', manager as unknown as EntityManager);

      expect(result).toBe(wallet);
    });

    it('creates a zero-balance wallet when none exists', async () => {
      const manager = makeManager();
      const zeroed = makeWallet(0);
      manager._repo.findOne.mockResolvedValue(null);
      manager._repo.save.mockResolvedValue(zeroed);

      const result = await service.getBalance('user-1', manager as unknown as EntityManager);

      expect(manager._repo.create).toHaveBeenCalledWith({ userId: 'user-1', balance: 0 });
      expect(result).toBe(zeroed);
    });
  });

  describe('deduct', () => {
    it('uses a pessimistic write lock when querying the wallet', async () => {
      const manager = makeManager();
      const wallet = makeWallet(1_000);
      manager._qb.getOne.mockResolvedValue(wallet);
      manager._repo.save.mockResolvedValue({ ...wallet, balance: 900 });

      await service.deduct('user-1', 100, manager as unknown as EntityManager);

      expect(manager._repo.createQueryBuilder).toHaveBeenCalledWith('w');
      expect(manager._qb.setLock).toHaveBeenCalledWith('pessimistic_write');
      expect(manager._qb.where).toHaveBeenCalledWith('w.userId = :userId', { userId: 'user-1' });
    });

    it('subtracts the amount and saves when balance is sufficient', async () => {
      const manager = makeManager();
      manager._qb.getOne.mockResolvedValue(makeWallet(1_000));
      manager._repo.save.mockResolvedValue(makeWallet(900));

      await service.deduct('user-1', 100, manager as unknown as EntityManager);

      expect(manager._repo.save).toHaveBeenCalledWith(expect.objectContaining({ balance: 900 }));
    });

    it('throws InsufficientFundsError when balance is below the required amount', async () => {
      const manager = makeManager();
      manager._qb.getOne.mockResolvedValue(makeWallet(50));

      await expect(service.deduct('user-1', 100, manager as unknown as EntityManager)).rejects.toThrow(
        InsufficientFundsError,
      );
      expect(manager._repo.save).not.toHaveBeenCalled();
    });

    it('throws InsufficientFundsError when the wallet does not exist', async () => {
      const manager = makeManager();
      manager._qb.getOne.mockResolvedValue(null);

      await expect(service.deduct('user-1', 100, manager as unknown as EntityManager)).rejects.toThrow(
        InsufficientFundsError,
      );
    });
  });

  describe('topUp', () => {
    it('adds the amount to an existing wallet and saves', async () => {
      const manager = makeManager();
      manager._qb.getOne.mockResolvedValue(makeWallet(500));
      manager._repo.save.mockResolvedValue(makeWallet(600));

      await service.topUp('user-1', 100, manager as unknown as EntityManager);

      expect(manager._repo.save).toHaveBeenCalledWith(expect.objectContaining({ balance: 600 }));
    });

    it('creates a new wallet with the top-up amount when none exists', async () => {
      const manager = makeManager();
      const created = makeWallet(200);
      manager._qb.getOne.mockResolvedValue(null);
      manager._repo.save.mockResolvedValue(created);

      const result = await service.topUp('user-1', 200, manager as unknown as EntityManager);

      expect(manager._repo.create).toHaveBeenCalledWith({ userId: 'user-1', balance: 200 });
      expect(result).toBe(created);
    });
  });
});
