import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { ProductsService } from './products.service';
import { ProductEntity } from './product.entity';
import { ProductNotFoundError } from './products.errors';

const makeProduct = (overrides: Partial<ProductEntity> = {}): ProductEntity =>
  ({
    id: 'prod-1',
    name: 'Widget',
    description: 'A fine widget',
    price: 9.99,
    stock: 100,
    isActive: true,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    ...overrides,
  }) as ProductEntity;

describe('ProductsService', () => {
  let service: ProductsService;
  let mockRepo: Record<string, jest.Mock>;
  let mockDataSource: Record<string, jest.Mock>;
  let mockCache: Record<string, jest.Mock>;

  beforeEach(async () => {
    mockRepo = {
      find: jest.fn(),
      findOne: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
    };

    mockDataSource = {
      transaction: jest.fn(),
    };

    mockCache = { get: jest.fn(), set: jest.fn(), del: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProductsService,
        { provide: getRepositoryToken(ProductEntity), useValue: mockRepo },
        { provide: DataSource, useValue: mockDataSource },
        { provide: CACHE_MANAGER, useValue: mockCache },
      ],
    }).compile();

    service = module.get(ProductsService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('findAll', () => {
    it('returns cached value without hitting the repository', async () => {
      const cached = [{ id: 'prod-1', name: 'Widget' }];
      mockCache.get.mockResolvedValue(cached);

      const result = await service.findAll();

      expect(result).toBe(cached);
      expect(mockRepo.find).not.toHaveBeenCalled();
    });

    it('queries the repository and caches result on cache miss', async () => {
      mockCache.get.mockResolvedValue(null);
      mockCache.set.mockResolvedValue(undefined);
      mockRepo.find.mockResolvedValue([makeProduct()]);

      const result = await service.findAll();

      expect(mockRepo.find).toHaveBeenCalledTimes(1);
      expect(mockCache.set).toHaveBeenCalledWith('products:all', result, expect.any(Number));
      expect(result[0]).toMatchObject({ id: 'prod-1', name: 'Widget' });
    });

    it('deduplicates concurrent cache-miss DB fetches', async () => {
      mockCache.get.mockResolvedValue(null);
      mockCache.set.mockResolvedValue(undefined);

      let resolveFind!: (v: ProductEntity[]) => void;
      const findPromise = new Promise<ProductEntity[]>((r) => {
        resolveFind = r;
      });
      mockRepo.find.mockReturnValueOnce(findPromise);

      const [p1, p2] = [service.findAll(), service.findAll()];
      resolveFind([makeProduct()]);
      await Promise.all([p1, p2]);

      expect(mockRepo.find).toHaveBeenCalledTimes(1);
    });
  });

  describe('findById', () => {
    it('returns cached value without hitting the repository', async () => {
      const cached = { id: 'prod-1', name: 'Widget' };
      mockCache.get.mockResolvedValue(cached);

      const result = await service.findById('prod-1');

      expect(result).toBe(cached);
      expect(mockRepo.findOne).not.toHaveBeenCalled();
    });

    it('queries the repository and caches result on cache miss', async () => {
      mockCache.get.mockResolvedValue(null);
      mockCache.set.mockResolvedValue(undefined);
      mockRepo.findOne.mockResolvedValue(makeProduct());

      const result = await service.findById('prod-1');

      expect(mockRepo.findOne).toHaveBeenCalledTimes(1);
      expect(mockCache.set).toHaveBeenCalledWith('product:prod-1', result, expect.any(Number));
    });

    it('throws ProductNotFoundError when product does not exist', async () => {
      mockCache.get.mockResolvedValue(null);
      mockRepo.findOne.mockResolvedValue(null);

      await expect(service.findById('missing')).rejects.toThrow(ProductNotFoundError);
    });
  });

  describe('reserveStock', () => {
    it('evicts cache before DB writes when called with an external manager', async () => {
      const callOrder: string[] = [];

      const mockManagerRepo = {
        findOne: jest.fn().mockImplementation(() => {
          callOrder.push('findOne');
          return Promise.resolve(makeProduct());
        }),
        save: jest.fn().mockImplementation(() => {
          callOrder.push('save');
          return Promise.resolve(makeProduct({ stock: 98 }));
        }),
      };
      const mockManager = {
        getRepository: jest.fn().mockReturnValue(mockManagerRepo),
      } as unknown as EntityManager;

      mockCache.del.mockImplementation(() => {
        callOrder.push('del');
        return Promise.resolve();
      });

      await service.reserveStock({ items: [{ productId: 'prod-1', quantity: 2 }] }, mockManager);

      const firstDbOp = Math.min(callOrder.indexOf('findOne'), callOrder.indexOf('save'));
      const lastDel = callOrder.lastIndexOf('del');
      expect(lastDel).toBeLessThan(firstDbOp);
    });
  });

  describe('releaseStock', () => {
    it('evicts cache before incrementing to prevent stale re-population window', async () => {
      const callOrder: string[] = [];

      const mockManagerRepo = {
        increment: jest.fn().mockImplementation(() => {
          callOrder.push('increment');
          return Promise.resolve();
        }),
      };
      const mockManager = {
        getRepository: jest.fn().mockReturnValue(mockManagerRepo),
      } as unknown as EntityManager;

      mockCache.del.mockImplementation(() => {
        callOrder.push('del');
        return Promise.resolve();
      });

      await service.releaseStock([{ productId: 'prod-1', quantity: 2 }], mockManager);

      const firstIncrement = callOrder.indexOf('increment');
      const lastDel = callOrder.lastIndexOf('del');
      expect(lastDel).toBeLessThan(firstIncrement);
    });

    it('evicts all affected product keys and the list key', async () => {
      const mockManagerRepo = { increment: jest.fn().mockResolvedValue(undefined) };
      const mockManager = {
        getRepository: jest.fn().mockReturnValue(mockManagerRepo),
      } as unknown as EntityManager;

      mockCache.del.mockResolvedValue(undefined);

      await service.releaseStock(
        [
          { productId: 'p1', quantity: 1 },
          { productId: 'p2', quantity: 3 },
        ],
        mockManager,
      );

      const deletedKeys = mockCache.del.mock.calls.map((c: unknown[]) => c[0]);
      expect(deletedKeys).toContain('product:p1');
      expect(deletedKeys).toContain('product:p2');
      expect(deletedKeys).toContain('products:all');
    });
  });
});
