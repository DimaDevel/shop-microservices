import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotificationService } from './notification.service';
import { NotificationLogEntity } from './notification-log.entity';
import { KAFKA_TOPICS, OrderConfirmedEvent, OrderCancelledEvent, PdfGeneratedEvent } from '@nest-gateway/shared';

describe('NotificationService', () => {
  let service: NotificationService;
  const mockLogRepo = { insert: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationService,
        { provide: getRepositoryToken(NotificationLogEntity), useValue: mockLogRepo },
      ],
    }).compile();

    service = module.get<NotificationService>(NotificationService);
  });

  const confirmedEvent: OrderConfirmedEvent = {
    orderId: 'o1',
    userId: 'u1',
    userEmail: 'user@example.com',
    correlationId: 'c1',
    items: [{ productId: 'p1', name: 'Widget', quantity: 2, unitPrice: 10 }],
    total: 20,
    confirmedAt: new Date().toISOString(),
  };

  const cancelledEvent: OrderCancelledEvent = {
    orderId: 'o1',
    userId: 'u1',
    userEmail: 'user@example.com',
    correlationId: 'c1',
    reason: 'Payment failed',
    cancelledAt: new Date().toISOString(),
  };

  const pdfEvent: PdfGeneratedEvent = {
    orderId: 'o1',
    userId: 'u1',
    userEmail: 'user@example.com',
    correlationId: 'c1',
    pdfPath: '/pdfs/o1.pdf',
    createdAt: new Date().toISOString(),
  };

  describe('notifyOrderConfirmed', () => {
    it('inserts a log record on first notification', async () => {
      mockLogRepo.insert.mockResolvedValue(undefined);
      await service.notifyOrderConfirmed(confirmedEvent);
      expect(mockLogRepo.insert).toHaveBeenCalledWith(
        expect.objectContaining({ orderId: 'o1', eventType: KAFKA_TOPICS.ORDER_CONFIRMED }),
      );
    });

    it('silently skips duplicate events (unique violation 23505)', async () => {
      mockLogRepo.insert.mockRejectedValue({ code: '23505' });
      await expect(service.notifyOrderConfirmed(confirmedEvent)).resolves.not.toThrow();
    });

    it('rethrows unexpected DB errors', async () => {
      mockLogRepo.insert.mockRejectedValue(new Error('connection lost'));
      await expect(service.notifyOrderConfirmed(confirmedEvent)).rejects.toThrow('connection lost');
    });
  });

  describe('notifyOrderCancelled', () => {
    it('inserts a log record on first notification', async () => {
      mockLogRepo.insert.mockResolvedValue(undefined);
      await service.notifyOrderCancelled(cancelledEvent);
      expect(mockLogRepo.insert).toHaveBeenCalledWith(
        expect.objectContaining({ orderId: 'o1', eventType: KAFKA_TOPICS.ORDER_CANCELLED }),
      );
    });

    it('silently skips duplicate events', async () => {
      mockLogRepo.insert.mockRejectedValue({ code: '23505' });
      await expect(service.notifyOrderCancelled(cancelledEvent)).resolves.not.toThrow();
    });
  });

  describe('notifyPdfReady', () => {
    it('inserts a log record on first notification', async () => {
      mockLogRepo.insert.mockResolvedValue(undefined);
      await service.notifyPdfReady(pdfEvent);
      expect(mockLogRepo.insert).toHaveBeenCalledWith(
        expect.objectContaining({ orderId: 'o1', eventType: KAFKA_TOPICS.PDF_GENERATED }),
      );
    });

    it('silently skips duplicate events', async () => {
      mockLogRepo.insert.mockRejectedValue({ code: '23505' });
      await expect(service.notifyPdfReady(pdfEvent)).resolves.not.toThrow();
    });
  });
});
