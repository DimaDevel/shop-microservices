import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { ProductEntity } from './product.entity';
import { CreateProductInput, UpdateProductInput, ReserveStockInput } from './products.inputs';
import { ProductResult, ReserveStockResult } from './products.outputs';
import { ProductNotFoundError, InsufficientStockError } from './products.errors';

@Injectable()
export class ProductsService {
  constructor(
    @InjectRepository(ProductEntity)
    private readonly productsRepo: Repository<ProductEntity>,
    private readonly dataSource: DataSource,
  ) {}

  async findAll(): Promise<ProductResult[]> {
    const products = await this.productsRepo.find({ where: { isActive: true } });
    return products.map(this.toResult);
  }

  async findById(id: string): Promise<ProductResult> {
    const product = await this.productsRepo.findOne({ where: { id, isActive: true } });
    if (!product) throw new ProductNotFoundError(id);
    return this.toResult(product);
  }

  async create(input: CreateProductInput): Promise<ProductResult> {
    const product = this.productsRepo.create(input);
    return this.toResult(await this.productsRepo.save(product));
  }

  async update(id: string, input: UpdateProductInput): Promise<ProductResult> {
    const product = await this.productsRepo.findOne({ where: { id, isActive: true } });
    if (!product) throw new ProductNotFoundError(id);
    Object.assign(product, input);
    return this.toResult(await this.productsRepo.save(product));
  }

  async remove(id: string): Promise<void> {
    const product = await this.productsRepo.findOne({ where: { id } });
    if (!product) throw new ProductNotFoundError(id);
    product.isActive = false;
    await this.productsRepo.save(product);
  }

  async reserveStock(input: ReserveStockInput): Promise<ReserveStockResult> {
    return this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(ProductEntity);
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
    });
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
