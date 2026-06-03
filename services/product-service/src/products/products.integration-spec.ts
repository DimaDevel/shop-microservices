import { Test, TestingModule } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { DataSource } from 'typeorm';
import { PostgreSqlContainer, StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { ProductsService } from './products.service';
import { ProductEntity } from './product.entity';
import { ProductNotFoundError, InsufficientStockError } from './products.errors';

// Null cache — prevents Redis dependency in integration tests.
// Business logic (DB reads/writes) is still fully exercised.
const nullCacheManager = {
  get: jest.fn().mockResolvedValue(null),
  set: jest.fn().mockResolvedValue(undefined),
  del: jest.fn().mockResolvedValue(undefined),
};

describe('ProductsService (integration)', () => {
  let container: StartedPostgreSqlContainer;
  let module: TestingModule;
  let service: ProductsService;
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
          entities: [ProductEntity],
          synchronize: true,
        }),
        TypeOrmModule.forFeature([ProductEntity]),
      ],
      providers: [
        ProductsService,
        { provide: CACHE_MANAGER, useValue: nullCacheManager },
      ],
    }).compile();

    service = module.get(ProductsService);
    dataSource = module.get(DataSource);
  }, 120_000);

  afterAll(async () => {
    await module.close();
    await container.stop();
  });

  afterEach(async () => {
    await dataSource.query('TRUNCATE products RESTART IDENTITY CASCADE');
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('persists a product and returns it', async () => {
      const result = await service.create({
        name: 'Widget',
        description: 'A test widget',
        price: 9.99,
        stock: 50,
      });

      expect(result.id).toBeTruthy();
      expect(result.name).toBe('Widget');
      expect(result.price).toBe(9.99);
      expect(result.stock).toBe(50);
      expect(result.isActive).toBe(true);

      const [row] = await dataSource.query(`SELECT name FROM products WHERE id = '${result.id}'`);
      expect(row.name).toBe('Widget');
    });
  });

  describe('findAll', () => {
    it('returns only active products', async () => {
      await service.create({ name: 'Active', description: '', price: 1, stock: 1 });
      const inactive = await service.create({ name: 'Inactive', description: '', price: 1, stock: 1 });
      await service.remove(inactive.id);

      const results = await service.findAll();

      expect(results.every((p) => p.isActive)).toBe(true);
      expect(results.find((p) => p.name === 'Active')).toBeTruthy();
      expect(results.find((p) => p.name === 'Inactive')).toBeUndefined();
    });
  });

  describe('findById', () => {
    it('returns the product', async () => {
      const product = await service.create({ name: 'Findable', description: '', price: 1, stock: 1 });

      const found = await service.findById(product.id);

      expect(found.id).toBe(product.id);
      expect(found.name).toBe('Findable');
    });

    it('throws ProductNotFoundError for unknown id', async () => {
      await expect(
        service.findById('00000000-0000-0000-0000-000000000000'),
      ).rejects.toThrow(ProductNotFoundError);
    });

    it('throws ProductNotFoundError for soft-deleted product', async () => {
      const product = await service.create({ name: 'Deleted', description: '', price: 1, stock: 1 });
      await service.remove(product.id);

      await expect(service.findById(product.id)).rejects.toThrow(ProductNotFoundError);
    });
  });

  describe('update', () => {
    it('updates supplied fields and leaves others unchanged', async () => {
      const product = await service.create({
        name: 'Original',
        description: 'Keep me',
        price: 10,
        stock: 5,
      });

      const updated = await service.update(product.id, { price: 20 });

      expect(updated.name).toBe('Original');
      expect(updated.description).toBe('Keep me');
      expect(updated.price).toBe(20);
      expect(updated.stock).toBe(5);
    });

    it('throws ProductNotFoundError for unknown id', async () => {
      await expect(
        service.update('00000000-0000-0000-0000-000000000000', { price: 1 }),
      ).rejects.toThrow(ProductNotFoundError);
    });
  });

  describe('remove', () => {
    it('soft-deletes the product (isActive = false)', async () => {
      const product = await service.create({ name: 'ToDelete', description: '', price: 1, stock: 1 });

      await service.remove(product.id);

      const [row] = await dataSource.query(
        `SELECT "isActive" FROM products WHERE id = '${product.id}'`,
      );
      expect(row.isActive).toBe(false);
    });

    it('throws ProductNotFoundError when product is already deleted', async () => {
      const product = await service.create({ name: 'Gone', description: '', price: 1, stock: 1 });
      await service.remove(product.id);

      await expect(service.remove(product.id)).rejects.toThrow(ProductNotFoundError);
    });
  });

  describe('reserveStock', () => {
    it('decrements stock and returns reserved items with unit prices', async () => {
      const product = await service.create({ name: 'Reservable', description: '', price: 25.0, stock: 10 });

      const result = await service.reserveStock({ items: [{ productId: product.id, quantity: 3 }] });

      expect(result.items).toHaveLength(1);
      expect(result.items[0].quantity).toBe(3);
      expect(result.items[0].unitPrice).toBe(25.0);

      const found = await service.findById(product.id);
      expect(found.stock).toBe(7);
    });

    it('throws InsufficientStockError when quantity exceeds stock', async () => {
      const product = await service.create({ name: 'LowStock', description: '', price: 1, stock: 2 });

      await expect(
        service.reserveStock({ items: [{ productId: product.id, quantity: 5 }] }),
      ).rejects.toThrow(InsufficientStockError);

      // Stock must remain unchanged after the failed reservation
      const found = await service.findById(product.id);
      expect(found.stock).toBe(2);
    });

    it('rolls back all reservations if any item fails', async () => {
      const p1 = await service.create({ name: 'Item1', description: '', price: 1, stock: 10 });
      const p2 = await service.create({ name: 'Item2', description: '', price: 1, stock: 1 });

      await expect(
        service.reserveStock({
          items: [
            { productId: p1.id, quantity: 3 },
            { productId: p2.id, quantity: 5 }, // exceeds p2.stock
          ],
        }),
      ).rejects.toThrow(InsufficientStockError);

      const found1 = await service.findById(p1.id);
      expect(found1.stock).toBe(10); // unchanged due to rollback
    });

    it('throws ProductNotFoundError for unknown product id', async () => {
      await expect(
        service.reserveStock({
          items: [{ productId: '00000000-0000-0000-0000-000000000000', quantity: 1 }],
        }),
      ).rejects.toThrow(ProductNotFoundError);
    });
  });

  describe('releaseStock (compensation)', () => {
    it('increments stock back after a release', async () => {
      const product = await service.create({ name: 'Releasable', description: '', price: 1, stock: 10 });
      await service.reserveStock({ items: [{ productId: product.id, quantity: 4 }] });

      await dataSource.transaction((mgr) =>
        service.releaseStock([{ productId: product.id, quantity: 4 }], mgr),
      );

      const found = await service.findById(product.id);
      expect(found.stock).toBe(10);
    });
  });
});
