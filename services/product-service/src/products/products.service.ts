import { Injectable, Inject } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { ProductEntity } from './product.entity';
import { CreateProductInput, UpdateProductInput, ReserveStockInput } from './products.inputs';
import { ProductResult, ReserveStockResult } from './products.outputs';
import { ProductNotFoundError, InsufficientStockError } from './products.errors';

const CACHE_TTL_ALL = 15 * 60 * 1000;  // 15 min
const CACHE_TTL_ONE = 10 * 60 * 1000;  // 10 min

const keyAll = () => 'products:all';
const keyOne = (id: string) => `product:${id}`;

@Injectable()
export class ProductsService {
  private readonly inflight = new Map<string, Promise<unknown>>();

  constructor(
    @InjectRepository(ProductEntity)
    private readonly productsRepo: Repository<ProductEntity>,
    private readonly dataSource: DataSource,
    @Inject(CACHE_MANAGER) private readonly cache: Cache,
  ) {}

  // Deduplicates concurrent cache-miss DB fetches for the same key.
  // Prevents thundering herd when a hot cache entry expires under load.
  private dedup<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const existing = this.inflight.get(key);
    if (existing) return existing as Promise<T>;
    const promise = fn().finally(() => this.inflight.delete(key));
    this.inflight.set(key, promise);
    return promise;
  }

  async findAll(): Promise<ProductResult[]> {
    const cached = await this.cache.get<ProductResult[]>(keyAll());
    if (cached) return cached;

    return this.dedup(keyAll(), async () => {
      const products = await this.productsRepo.find({ where: { isActive: true } });
      const result = products.map(this.toResult);
      await this.cache.set(keyAll(), result, CACHE_TTL_ALL);
      return result;
    });
  }

  async findById(id: string): Promise<ProductResult> {
    const cached = await this.cache.get<ProductResult>(keyOne(id));
    if (cached) return cached;

    return this.dedup(keyOne(id), async () => {
      const product = await this.productsRepo.findOne({ where: { id, isActive: true } });
      if (!product) throw new ProductNotFoundError(id);
      const result = this.toResult(product);
      await this.cache.set(keyOne(id), result, CACHE_TTL_ONE);
      return result;
    });
  }

  async create(input: CreateProductInput): Promise<ProductResult> {
    const product = this.productsRepo.create(input);
    const result = this.toResult(await this.productsRepo.save(product));
    await this.cache.del(keyAll());
    return result;
  }

  async update(id: string, input: UpdateProductInput): Promise<ProductResult> {
    const product = await this.productsRepo.findOne({ where: { id, isActive: true } });
    if (!product) throw new ProductNotFoundError(id);
    Object.assign(product, input);
    const result = this.toResult(await this.productsRepo.save(product));
    await Promise.all([this.cache.del(keyOne(id)), this.cache.del(keyAll())]);
    return result;
  }

  async remove(id: string): Promise<void> {
    const product = await this.productsRepo.findOne({ where: { id } });
    if (!product) throw new ProductNotFoundError(id);
    product.isActive = false;
    await this.productsRepo.save(product);
    await Promise.all([this.cache.del(keyOne(id)), this.cache.del(keyAll())]);
  }

  // Accepts an external manager so it can participate in the caller's transaction.
  // Falls back to its own transaction when called from the HTTP endpoint.
  async reserveStock(input: ReserveStockInput, manager?: EntityManager): Promise<ReserveStockResult> {
    const run = async (mgr: EntityManager): Promise<ReserveStockResult> => {
      const repo = mgr.getRepository(ProductEntity);
      const reserved = [];

      for (const item of input.items) {
        const product = await repo.findOne({
          where: { id: item.productId, isActive: true },
          lock: { mode: 'pessimistic_write' },
        });

        if (!product) throw new ProductNotFoundError(item.productId);
        if (product.stock < item.quantity) {
          throw new InsufficientStockError(item.productId, item.quantity, product.stock);
        }

        product.stock -= item.quantity;
        await repo.save(product);

        reserved.push({
          productId: product.id,
          name: product.name,
          unitPrice: Number(product.price),
          quantity: item.quantity,
        });
      }

      return { items: reserved };
    };

    // For the external-manager path: evict before the DB writes so there is no
    // window between transaction commit and eviction where a reader can
    // re-populate the cache with pre-reservation stock counts.
    // For the own-transaction path: evict after commit (cache miss is harmless).
    const evict = () =>
      Promise.all([
        ...input.items.map((item) => this.cache.del(keyOne(item.productId))),
        this.cache.del(keyAll()),
      ]);

    if (manager) {
      await evict();
      return run(manager);
    }

    const result = await this.dataSource.transaction(run);
    await evict();
    return result;
  }

  // Compensation: restore stock after a failed payment.
  async releaseStock(
    items: Array<{ productId: string; quantity: number }>,
    manager: EntityManager,
  ): Promise<void> {
    // Evict before incrementing: prevents a concurrent reader from re-populating
    // the cache with the pre-compensation value during the uncommitted transaction window.
    await Promise.all([
      ...items.map((item) => this.cache.del(keyOne(item.productId))),
      this.cache.del(keyAll()),
    ]);

    const repo = manager.getRepository(ProductEntity);
    for (const item of items) {
      await repo.increment({ id: item.productId }, 'stock', item.quantity);
    }
  }

  private toResult(product: ProductEntity): ProductResult {
    return {
      id: product.id,
      name: product.name,
      description: product.description,
      price: Number(product.price),
      stock: product.stock,
      isActive: product.isActive,
      createdAt: product.createdAt,
      updatedAt: product.updatedAt,
    };
  }
}
