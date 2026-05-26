import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { EntityManager } from 'typeorm';
import { PaymentsService } from './payments.service';
import { PaymentEntity, PaymentStatus } from './payment.entity';
import { PaymentDeclinedError } from './payments.errors';

describe('PaymentsService', () => {
  let service: PaymentsService;

  const mockPaymentRepo = {
    create: jest.fn(),
    save: jest.fn(),
    update: jest.fn(),
  };

  const mockManager = {
    getRepository: jest.fn().mockReturnValue(mockPaymentRepo),
  } as unknown as EntityManager;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [PaymentsService, { provide: getRepositoryToken(PaymentEntity), useValue: {} }],
    }).compile();

    service = module.get<PaymentsService>(PaymentsService);
  });

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

  beforeEach(() => {
    mockPaymentRepo.create.mockReturnValue(savedPayment);
    mockPaymentRepo.save.mockResolvedValue(savedPayment);
    mockPaymentRepo.update.mockResolvedValue(undefined);
  });

  describe('processPayment', () => {
    it('completes and returns a transactionId when amount < 10000', async () => {
      const result = await service.processPayment({ orderId: 'order-1', userId: 'user-1', amount: 9_999 }, mockManager);

      expect(result.transactionId).toMatch(/^txn-/);
      expect(mockPaymentRepo.update).toHaveBeenCalledWith(
        savedPayment.id,
        expect.objectContaining({ status: PaymentStatus.COMPLETED }),
      );
    });

    it('marks payment failed and throws PaymentDeclinedError when amount >= 10000', async () => {
      await expect(
        service.processPayment({ orderId: 'order-1', userId: 'user-1', amount: 10_000 }, mockManager),
      ).rejects.toThrow(PaymentDeclinedError);

      expect(mockPaymentRepo.update).toHaveBeenCalledWith(
        savedPayment.id,
        expect.objectContaining({ status: PaymentStatus.FAILED }),
      );
    });
  });
});
