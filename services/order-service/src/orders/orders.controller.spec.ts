import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, UnauthorizedException } from '@nestjs/common';
import { OrdersController } from './orders.controller';
import { CreateOrderUseCase } from './application/use-cases/create-order.use-case';
import { GetOrderUseCase } from './application/use-cases/get-order.use-case';
import { GetUserOrdersUseCase } from './application/use-cases/get-user-orders.use-case';
import { OrderNotFoundError } from './domain/errors/orders.errors';
import { OrderStatus } from './domain/entities/order';
import { CreateOrderDto, PaginationQueryDto } from './orders.dto';

const makeResult = (id = 'order-1') => ({
  id,
  userId: 'user-1',
  userEmail: 'user@example.com',
  status: OrderStatus.PENDING,
  total: 0,
  items: [],
  createdAt: new Date(),
  updatedAt: new Date(),
});

describe('OrdersController', () => {
  let controller: OrdersController;
  let createUseCase: { execute: jest.Mock };
  let getUseCase: { execute: jest.Mock };
  let getUserUseCase: { execute: jest.Mock };

  beforeEach(async () => {
    createUseCase = { execute: jest.fn() };
    getUseCase = { execute: jest.fn() };
    getUserUseCase = { execute: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [OrdersController],
      providers: [
        { provide: CreateOrderUseCase, useValue: createUseCase },
        { provide: GetOrderUseCase, useValue: getUseCase },
        { provide: GetUserOrdersUseCase, useValue: getUserUseCase },
      ],
    }).compile();

    controller = module.get(OrdersController);
  });

  describe('POST /orders', () => {
    it('creates an order and returns 202 result', async () => {
      createUseCase.execute.mockResolvedValue(makeResult());

      const result = await controller.create(
        { items: [{ productId: 'prod-1', quantity: 2 }] } as CreateOrderDto,
        'user-1',
        'user@example.com',
        'corr-1',
      );

      expect(createUseCase.execute).toHaveBeenCalledWith({
        userId: 'user-1',
        userEmail: 'user@example.com',
        correlationId: 'corr-1',
        items: [{ productId: 'prod-1', quantity: 2 }],
      });
      expect(result.id).toBe('order-1');
    });

    it('throws UnauthorizedException when userId header is missing', async () => {
      await expect(controller.create({ items: [] } as CreateOrderDto, '', 'user@example.com', 'corr-1')).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  describe('GET /orders', () => {
    it('returns paginated orders for the user', async () => {
      const paginated = {
        data: [makeResult('order-1'), makeResult('order-2')],
        meta: { page: 1, limit: 20, total: 2, totalPages: 1 },
      };
      getUserUseCase.execute.mockResolvedValue(paginated);

      const result = await controller.findAll({ page: 1, limit: 20 } as PaginationQueryDto, 'user-1');

      expect(getUserUseCase.execute).toHaveBeenCalledWith('user-1', 1, 20);
      expect(result).toBe(paginated);
    });

    it('throws UnauthorizedException when userId header is missing', () => {
      expect(() => controller.findAll({ page: 1, limit: 20 } as PaginationQueryDto, '')).toThrow(UnauthorizedException);
    });
  });

  describe('GET /orders/:id', () => {
    it('returns a single order', async () => {
      getUseCase.execute.mockResolvedValue(makeResult());

      const result = await controller.findById('order-1', 'user-1');

      expect(getUseCase.execute).toHaveBeenCalledWith('order-1', 'user-1');
      expect(result.id).toBe('order-1');
    });

    it('throws UnauthorizedException when userId header is missing', async () => {
      await expect(controller.findById('order-1', '')).rejects.toThrow(UnauthorizedException);
    });

    it('maps OrderNotFoundError → NotFoundException (404)', async () => {
      getUseCase.execute.mockRejectedValue(new OrderNotFoundError('order-1'));

      await expect(controller.findById('order-1', 'user-1')).rejects.toThrow(NotFoundException);
    });

    it('rethrows unexpected errors unchanged', async () => {
      getUseCase.execute.mockRejectedValue(new Error('db down'));

      await expect(controller.findById('order-1', 'user-1')).rejects.toThrow('db down');
    });
  });
});
