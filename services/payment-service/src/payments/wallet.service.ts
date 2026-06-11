import { Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { UserWalletEntity } from './user-wallet.entity';
import { InsufficientFundsError } from './payments.errors';

@Injectable()
export class WalletService {
  async findOrCreate(userId: string, initialBalance: number, manager: EntityManager): Promise<UserWalletEntity> {
    const repo = manager.getRepository(UserWalletEntity);
    const existing = await repo.findOne({ where: { userId } });
    if (existing) return existing;
    return repo.save(repo.create({ userId, balance: initialBalance }));
  }

  async getBalance(userId: string, manager: EntityManager): Promise<UserWalletEntity> {
    const repo = manager.getRepository(UserWalletEntity);
    const wallet = await repo.findOne({ where: { userId } });
    if (!wallet) {
      return repo.save(repo.create({ userId, balance: 0 }));
    }
    return wallet;
  }

  async deduct(userId: string, amount: number, manager: EntityManager): Promise<UserWalletEntity> {
    const repo = manager.getRepository(UserWalletEntity);
    // SELECT FOR UPDATE prevents concurrent orders from double-spending the same balance
    const wallet = await repo
      .createQueryBuilder('w')
      .setLock('pessimistic_write')
      .where('w.userId = :userId', { userId })
      .getOne();

    if (!wallet) {
      throw new InsufficientFundsError(0, amount);
    }

    const available = Number(wallet.balance);
    if (available < amount) {
      throw new InsufficientFundsError(available, amount);
    }

    wallet.balance = available - amount;
    return repo.save(wallet);
  }

  async topUp(userId: string, amount: number, manager: EntityManager): Promise<UserWalletEntity> {
    const repo = manager.getRepository(UserWalletEntity);
    const wallet = await repo
      .createQueryBuilder('w')
      .setLock('pessimistic_write')
      .where('w.userId = :userId', { userId })
      .getOne();

    if (!wallet) {
      return repo.save(repo.create({ userId, balance: amount }));
    }

    wallet.balance = Number(wallet.balance) + amount;
    return repo.save(wallet);
  }
}
