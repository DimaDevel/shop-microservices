import { Test, TestingModule } from '@nestjs/testing';
import { GetOrderUseCase } from './get-order.use-case';
import { ORDER_REPOSITORY } from '../../domain/repositories/order.repository';
import { Order, OrderStatus } from '../../domain/entities/order';
import { OrderItem } from '../../domain/entities/order-item';
import { OrderNotFoundError } from '../../domain/errors/orders.errors';

const makeOrder = (): Order =>
  new Order(
    'order-1',
    'user-1',
    'user@example.com',
    OrderStatus.PENDING,
    0,
    [new OrderItem('item-1', 'prod-1', 'Widget', 2, 25)],
    new Date(),
    new Date(),
  );

describe('GetOrderUseCase', () => {
  let useCase: GetOrderUseCase;
  let orderRepo: { findById: jest.Mock; findByUser: jest.Mock; save: jest.Mock; update: jest.Mock };

  beforeEach(async () => {
    orderRepo = { findById: jest.fn(), findByUser: jest.fn(), save: jest.fn(), update: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [GetOrderUseCase, { provide: ORDER_REPOSITORY, useValue: orderRepo }],
    }).compile();

    useCase = module.get(GetOrderUseCase);
  });

  it('returns OrderResult when order belongs to the requesting user', async () => {
    orderRepo.findById.mockResolvedValue(makeOrder());

    const result = await useCase.execute('order-1', 'user-1');

    expect(result.id).toBe('order-1');
    expect(result.userId).toBe('user-1');
    expect(result.items).toHaveLength(1);
  });

  it('throws OrderNotFoundError when the order does not exist', async () => {
    orderRepo.findById.mockResolvedValue(null);

    await expect(useCase.execute('order-1', 'user-1')).rejects.toThrow(OrderNotFoundError);
  });

  it('throws OrderNotFoundError when the order belongs to a different user', async () => {
    orderRepo.findById.mockResolvedValue(makeOrder()); // order owned by 'user-1'

    await expect(useCase.execute('order-1', 'user-2')).rejects.toThrow(OrderNotFoundError);
  });
});
