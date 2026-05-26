import { Test, TestingModule } from '@nestjs/testing';
import { GetUserOrdersUseCase } from './get-user-orders.use-case';
import { ORDER_REPOSITORY } from '../../domain/repositories/order.repository';
import { Order, OrderStatus } from '../../domain/entities/order';
import { OrderItem } from '../../domain/entities/order-item';

const makeOrder = (id: string): Order =>
  new Order(id, 'user-1', 'user@example.com', OrderStatus.PENDING, 0, [
    new OrderItem('item-1', 'prod-1', 'Widget', 2, 25),
  ], new Date(), new Date());

describe('GetUserOrdersUseCase', () => {
  let useCase: GetUserOrdersUseCase;
  let orderRepo: { findById: jest.Mock; findByUser: jest.Mock; save: jest.Mock; update: jest.Mock };

  beforeEach(async () => {
    orderRepo = { findById: jest.fn(), findByUser: jest.fn(), save: jest.fn(), update: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GetUserOrdersUseCase,
        { provide: ORDER_REPOSITORY, useValue: orderRepo },
      ],
    }).compile();

    useCase = module.get(GetUserOrdersUseCase);
  });

  it('returns all orders for the user', async () => {
    orderRepo.findByUser.mockResolvedValue([makeOrder('order-1'), makeOrder('order-2')]);

    const results = await useCase.execute('user-1');

    expect(results).toHaveLength(2);
    expect(results[0].id).toBe('order-1');
    expect(results[1].id).toBe('order-2');
  });

  it('returns an empty array when the user has no orders', async () => {
    orderRepo.findByUser.mockResolvedValue([]);

    const results = await useCase.execute('user-1');

    expect(results).toEqual([]);
  });

  it('maps each order to an OrderResult with correct fields', async () => {
    orderRepo.findByUser.mockResolvedValue([makeOrder('order-1')]);

    const [result] = await useCase.execute('user-1');

    expect(result.userId).toBe('user-1');
    expect(result.status).toBe(OrderStatus.PENDING);
    expect(result.items[0].productName).toBe('Widget');
  });
});
