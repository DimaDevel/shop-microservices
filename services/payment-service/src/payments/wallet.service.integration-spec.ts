import { Test, TestingModule } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { PostgreSqlContainer, StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { WalletService } from './wallet.service';
import { UserWalletEntity } from './user-wallet.entity';
import { InsufficientFundsError } from './payments.errors';

describe('WalletService (integration)', () => {
  let container: StartedPostgreSqlContainer;
  let module: TestingModule;
  let service: WalletService;
  let dataSource: DataSource;

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:16-alpine').start();

    module = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot({
          type: 'postgres',
          host: container.getHost(),
          port: container.getFirstMappedPort(),
          username: container.getUsername(),
          password: container.getPassword(),
          database: container.getDatabase(),
          entities: [UserWalletEntity],
          synchronize: true,
        }),
        TypeOrmModule.forFeature([UserWalletEntity]),
      ],
      providers: [WalletService],
    }).compile();

    service = module.get(WalletService);
    dataSource = module.get(DataSource);
  }, 120_000);

  afterAll(async () => {
    await module.close();
    await container.stop();
  });

  afterEach(async () => {
    await dataSource.query('TRUNCATE user_wallets RESTART IDENTITY CASCADE');
  });

  describe('findOrCreate', () => {
    it('persists a new wallet with the given initial balance', async () => {
      const wallet = await dataSource.transaction((mgr) => service.findOrCreate('user-1', 10_000, mgr));

      expect(wallet.userId).toBe('user-1');
      expect(Number(wallet.balance)).toBe(10_000);

      const [row] = await dataSource.query(`SELECT balance FROM user_wallets WHERE "userId" = 'user-1'`);
      expect(Number(row.balance)).toBe(10_000);
    });

    it('returns the existing wallet without resetting the balance on a second call', async () => {
      await dataSource.transaction((mgr) => service.findOrCreate('user-2', 10_000, mgr));
      await dataSource.transaction((mgr) => service.deduct('user-2', 500, mgr));

      const wallet = await dataSource.transaction((mgr) => service.findOrCreate('user-2', 10_000, mgr));

      expect(Number(wallet.balance)).toBe(9_500);
    });
  });

  describe('deduct', () => {
    beforeEach(async () => {
      await dataSource.transaction((mgr) => service.findOrCreate('user-3', 1_000, mgr));
    });

    it('decrements the balance by the requested amount', async () => {
      await dataSource.transaction((mgr) => service.deduct('user-3', 300, mgr));

      const [row] = await dataSource.query(`SELECT balance FROM user_wallets WHERE "userId" = 'user-3'`);
      expect(Number(row.balance)).toBe(700);
    });

    it('throws InsufficientFundsError and leaves balance unchanged when funds are too low', async () => {
      await expect(dataSource.transaction((mgr) => service.deduct('user-3', 2_000, mgr))).rejects.toThrow(
        InsufficientFundsError,
      );

      const [row] = await dataSource.query(`SELECT balance FROM user_wallets WHERE "userId" = 'user-3'`);
      expect(Number(row.balance)).toBe(1_000);
    });

    it('allows balance to reach exactly zero', async () => {
      await dataSource.transaction((mgr) => service.deduct('user-3', 1_000, mgr));

      const [row] = await dataSource.query(`SELECT balance FROM user_wallets WHERE "userId" = 'user-3'`);
      expect(Number(row.balance)).toBe(0);
    });

    it('rolls back the deduction when the surrounding transaction is aborted', async () => {
      await expect(
        dataSource.transaction(async (mgr) => {
          await service.deduct('user-3', 200, mgr);
          throw new Error('forced rollback');
        }),
      ).rejects.toThrow('forced rollback');

      const [row] = await dataSource.query(`SELECT balance FROM user_wallets WHERE "userId" = 'user-3'`);
      expect(Number(row.balance)).toBe(1_000);
    });
  });

  describe('topUp', () => {
    it('adds funds to an existing wallet', async () => {
      await dataSource.transaction((mgr) => service.findOrCreate('user-4', 500, mgr));

      await dataSource.transaction((mgr) => service.topUp('user-4', 200, mgr));

      const [row] = await dataSource.query(`SELECT balance FROM user_wallets WHERE "userId" = 'user-4'`);
      expect(Number(row.balance)).toBe(700);
    });

    it('creates a wallet with the top-up amount when the user has no wallet yet', async () => {
      await dataSource.transaction((mgr) => service.topUp('user-5', 300, mgr));

      const [row] = await dataSource.query(`SELECT balance FROM user_wallets WHERE "userId" = 'user-5'`);
      expect(Number(row.balance)).toBe(300);
    });
  });
});
