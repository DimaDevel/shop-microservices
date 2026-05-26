import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  ParseUUIDPipe,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Headers,
  HttpCode,
} from '@nestjs/common';
import { ProductsService } from './products.service';
import { CreateProductDto, UpdateProductDto, ReserveStockDto } from './products.dto';
import { HEADERS, Role } from '@nest-gateway/shared';
import { ProductNotFoundError, InsufficientStockError } from './products.errors';

@Controller('products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Get()
  findAll() {
    return this.productsService.findAll();
  }

  @Get(':id')
  async findById(@Param('id', ParseUUIDPipe) id: string) {
    try {
      return await this.productsService.findById(id);
    } catch (e) {
      if (e instanceof ProductNotFoundError) throw new NotFoundException(e.message);
      throw e;
    }
  }

  @Post()
  async create(@Body() dto: CreateProductDto, @Headers(HEADERS.USER_ROLES) rolesHeader: string) {
    this.requireAdmin(rolesHeader);
    return this.productsService.create({
      name: dto.name,
      description: dto.description,
      price: dto.price,
      stock: dto.stock,
    });
  }

  @Patch(':id')
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateProductDto,
    @Headers(HEADERS.USER_ROLES) rolesHeader: string,
  ) {
    this.requireAdmin(rolesHeader);
    try {
      return await this.productsService.update(id, {
        name: dto.name,
        description: dto.description,
        price: dto.price,
        stock: dto.stock,
      });
    } catch (e) {
      if (e instanceof ProductNotFoundError) throw new NotFoundException(e.message);
      throw e;
    }
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@Param('id', ParseUUIDPipe) id: string, @Headers(HEADERS.USER_ROLES) rolesHeader: string) {
    this.requireAdmin(rolesHeader);
    try {
      await this.productsService.remove(id);
    } catch (e) {
      if (e instanceof ProductNotFoundError) throw new NotFoundException(e.message);
      throw e;
    }
  }

  @Post('reserve')
  async reserveStock(@Body() dto: ReserveStockDto) {
    try {
      return await this.productsService.reserveStock({ items: dto.items });
    } catch (e) {
      if (e instanceof ProductNotFoundError) throw new NotFoundException(e.message);
      if (e instanceof InsufficientStockError) throw new BadRequestException(e.message);
      throw e;
    }
  }

  private requireAdmin(rolesHeader: string): void {
    const roles = rolesHeader ? rolesHeader.split(',') : [];
    if (!roles.includes(Role.ADMIN)) {
      throw new ForbiddenException('Admin role required');
    }
  }
}
