import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { EntityManager } from 'typeorm';
import { PaymentsService } from './payments.service';
import { WalletService } from './wallet.service';
import { PaymentEntity, PaymentStatus } from './payment.entity';
import { InsufficientFundsError } from './payments.errors';

describe('PaymentsService', () => {
  let service: PaymentsService;
  let walletService: { deduct: jest.Mock };

  const mockPaymentRepo = {
    create: jest.fn(),
    save: jest.fn(),
    update: jest.fn(),
  };

  const mockManager = {
    getRepository: jest.fn().mockReturnValue(mockPaymentRepo),
  } as unknown as EntityManager;

  const savedPayment = {
    id: 'pay-1',
    orderId: 'order-1',
    userId: 'user-1',
    amount: 100,
    status: PaymentStatus.PENDING,
    transactionId: null,
    failureReason: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as PaymentEntity;

  beforeEach(async () => {
    jest.clearAllMocks();
    walletService = { deduct: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentsService,
        { provide: getRepositoryToken(PaymentEntity), useValue: {} },
        { provide: WalletService, useValue: walletService },
      ],
    }).compile();

    service = module.get<PaymentsService>(PaymentsService);

    mockPaymentRepo.create.mockReturnValue(savedPayment);
    mockPaymentRepo.save.mockResolvedValue(savedPayment);
    mockPaymentRepo.update.mockResolvedValue(undefined);
  });

  describe('processPayment', () => {
    it('deducts from wallet, marks payment COMPLETED, and returns a transactionId', async () => {
      walletService.deduct.mockResolvedValue(undefined);

      const result = await service.processPayment({ orderId: 'order-1', userId: 'user-1', amount: 100 }, mockManager);

      expect(walletService.deduct).toHaveBeenCalledWith('user-1', 100, mockManager);
      expect(result.transactionId).toMatch(/^txn-/);
      expect(mockPaymentRepo.update).toHaveBeenCalledWith(
        savedPayment.id,
        expect.objectContaining({ status: PaymentStatus.COMPLETED }),
      );
    });

    it('propagates InsufficientFundsError from the wallet without marking the payment completed', async () => {
      walletService.deduct.mockRejectedValue(new InsufficientFundsError(50, 100));

      await expect(
        service.processPayment({ orderId: 'order-1', userId: 'user-1', amount: 100 }, mockManager),
      ).rejects.toThrow(InsufficientFundsError);

      expect(mockPaymentRepo.update).not.toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ status: PaymentStatus.COMPLETED }),
      );
    });

    it('passes the entity manager to walletService.deduct', async () => {
      walletService.deduct.mockResolvedValue(undefined);

      await service.processPayment({ orderId: 'order-1', userId: 'user-1', amount: 50 }, mockManager);

      expect(walletService.deduct.mock.calls[0][2]).toBe(mockManager);
    });
  });
});
