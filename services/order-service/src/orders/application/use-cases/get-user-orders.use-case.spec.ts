import { Test, TestingModule } from '@nestjs/testing';
import { GetUserOrdersUseCase } from './get-user-orders.use-case';
import { ORDER_REPOSITORY } from '../../domain/repositories/order.repository';
import { Order, OrderStatus } from '../../domain/entities/order';
import { OrderItem } from '../../domain/entities/order-item';

const makeOrder = (id: string): Order =>
  new Order(
    id,
    'user-1',
    'user@example.com',
    OrderStatus.PENDING,
    0,
    [new OrderItem('item-1', 'prod-1', 'Widget', 2, 25)],
    new Date(),
    new Date(),
  );

describe('GetUserOrdersUseCase', () => {
  let useCase: GetUserOrdersUseCase;
  let orderRepo: { findById: jest.Mock; findByUser: jest.Mock; save: jest.Mock; update: jest.Mock };

  beforeEach(async () => {
    orderRepo = { findById: jest.fn(), findByUser: jest.fn(), save: jest.fn(), update: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [GetUserOrdersUseCase, { provide: ORDER_REPOSITORY, useValue: orderRepo }],
    }).compile();

    useCase = module.get(GetUserOrdersUseCase);
  });

  it('returns paginated orders for the user', async () => {
    orderRepo.findByUser.mockResolvedValue({ items: [makeOrder('order-1'), makeOrder('order-2')], total: 2 });

    const result = await useCase.execute('user-1', 1, 20);

    expect(result.data).toHaveLength(2);
    expect(result.data[0].id).toBe('order-1');
    expect(result.meta).toEqual({ page: 1, limit: 20, total: 2, totalPages: 1 });
  });

  it('returns empty data when the user has no orders', async () => {
    orderRepo.findByUser.mockResolvedValue({ items: [], total: 0 });

    const result = await useCase.execute('user-1', 1, 20);

    expect(result.data).toEqual([]);
    expect(result.meta.total).toBe(0);
  });

  it('maps each order to an OrderResult with correct fields', async () => {
    orderRepo.findByUser.mockResolvedValue({ items: [makeOrder('order-1')], total: 1 });

    const { data } = await useCase.execute('user-1', 1, 20);
    const [result] = data;

    expect(result.userId).toBe('user-1');
    expect(result.status).toBe(OrderStatus.PENDING);
    expect(result.items[0].productName).toBe('Widget');
  });
});
