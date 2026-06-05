import { Injectable, Inject } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { ProductEntity } from './product.entity';
import { PaginateProductsInput, CreateProductInput, UpdateProductInput, ReserveStockInput } from './products.inputs';
import { ProductResult, ReserveStockResult } from './products.outputs';
import { PaginatedResult } from '@nest-gateway/shared';
import { ProductNotFoundError, InsufficientStockError } from './products.errors';

const CACHE_TTL_ONE = 10 * 60 * 1000; // 10 min

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

  private async cacheGet<T>(key: string): Promise<T | null> {
    try {
      return (await this.cache.get<T>(key)) ?? null;
    } catch {
      return null;
    }
  }

  private async cacheSet(key: string, value: unknown, ttl: number): Promise<void> {
    try {
      await this.cache.set(key, value, ttl);
    } catch {
      // Redis unavailable — serve from DB, no cache write
    }
  }

  private async cacheDel(...keys: string[]): Promise<void> {
    try {
      await Promise.all(keys.map((k) => this.cache.del(k)));
    } catch {
      // Redis unavailable — cache eviction skipped, will expire naturally
    }
  }

  async findAll(input: PaginateProductsInput): Promise<PaginatedResult<ProductResult>> {
    const { page, limit } = input;
    const [products, total] = await this.productsRepo.findAndCount({
      where: { isActive: true },
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return {
      data: products.map(this.toResult),
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async findById(id: string): Promise<ProductResult> {
    const cached = await this.cacheGet<ProductResult>(keyOne(id));
    if (cached) return cached;

    return this.dedup(keyOne(id), async () => {
      const product = await this.productsRepo.findOne({ where: { id, isActive: true } });
      if (!product) throw new ProductNotFoundError(id);
      const result = this.toResult(product);
      await this.cacheSet(keyOne(id), result, CACHE_TTL_ONE);
      return result;
    });
  }

  async create(input: CreateProductInput): Promise<ProductResult> {
    const product = this.productsRepo.create(input);
    return this.toResult(await this.productsRepo.save(product));
  }

  async update(id: string, input: UpdateProductInput): Promise<ProductResult> {
    const product = await this.productsRepo.findOne({ where: { id, isActive: true } });
    if (!product) throw new ProductNotFoundError(id);
    const defined = Object.fromEntries(Object.entries(input).filter(([, v]) => v !== undefined));
    Object.assign(product, defined);
    const result = this.toResult(await this.productsRepo.save(product));
    await this.cacheDel(keyOne(id));
    return result;
  }

  async remove(id: string): Promise<void> {
    const product = await this.productsRepo.findOne({ where: { id, isActive: true } });
    if (!product) throw new ProductNotFoundError(id);
    product.isActive = false;
    await this.productsRepo.save(product);
    await this.cacheDel(keyOne(id));
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
    const evict = () => this.cacheDel(...input.items.map((item) => keyOne(item.productId)));

    if (manager) {
      await evict();
      return run(manager);
    }

    const result = await this.dataSource.transaction(run);
    await evict();
    return result;
  }

  // Compensation: restore stock after a failed payment.
  async releaseStock(items: Array<{ productId: string; quantity: number }>, manager: EntityManager): Promise<void> {
    // Evict before incrementing: prevents a concurrent reader from re-populating
    // the cache with the pre-compensation value during the uncommitted transaction window.
    await this.cacheDel(...items.map((item) => keyOne(item.productId)));

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
