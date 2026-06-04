import { Controller, Get, Post, Patch, Delete, Body, Param, Req, Res, HttpCode } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiParam, ApiBody, ApiResponse } from '@nestjs/swagger';
import { FastifyRequest, FastifyReply } from 'fastify';
import { CurrentUser, RequestUser, Roles, Role } from '@nest-gateway/shared';
import { ProxyService } from './proxy.service';
import { ProductDto, CreateProductRequestDto, UpdateProductRequestDto } from '../../swagger/product.dto';
import { ApiErrorDto } from '../../swagger/common.dto';

@ApiTags('Products')
@ApiBearerAuth()
@Controller('products')
export class ProductsProxyController {
  constructor(private readonly proxyService: ProxyService) {}

  @Get()
  @ApiOperation({ summary: 'List all products' })
  @ApiResponse({ status: 200, description: 'Array of products', type: [ProductDto] })
  async findAll(
    @Req() req: FastifyRequest & { correlationId?: string },
    @Res() res: FastifyReply,
    @CurrentUser() user: RequestUser,
  ) {
    const { status, data } = await this.proxyService.proxyToProducts({
      method: 'GET',
      path: '/products',
      user,
      correlationId: req.correlationId,
    });
    return res.status(status).send(data);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a product by ID' })
  @ApiParam({ name: 'id', description: 'Product UUID' })
  @ApiResponse({ status: 200, description: 'Product details', type: ProductDto })
  @ApiResponse({ status: 404, description: 'Product not found', type: ApiErrorDto })
  async findById(
    @Param('id') id: string,
    @Req() req: FastifyRequest & { correlationId?: string },
    @Res() res: FastifyReply,
    @CurrentUser() user: RequestUser,
  ) {
    const { status, data } = await this.proxyService.proxyToProducts({
      method: 'GET',
      path: `/products/${id}`,
      user,
      correlationId: req.correlationId,
    });
    return res.status(status).send(data);
  }

  @Post()
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Create a product (Admin only)', description: 'Requires the `admin` role.' })
  @ApiBody({ type: CreateProductRequestDto })
  @ApiResponse({ status: 201, description: 'Product created', type: ProductDto })
  @ApiResponse({ status: 403, description: 'Forbidden — admin role required', type: ApiErrorDto })
  async create(
    @Body() body: unknown,
    @Req() req: FastifyRequest & { correlationId?: string },
    @Res() res: FastifyReply,
    @CurrentUser() user: RequestUser,
  ) {
    const { status, data } = await this.proxyService.proxyToProducts({
      method: 'POST',
      path: '/products',
      body,
      user,
      correlationId: req.correlationId,
    });
    return res.status(status).send(data);
  }

  @Patch(':id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Update a product (Admin only)', description: 'Requires the `admin` role. All fields are optional.' })
  @ApiParam({ name: 'id', description: 'Product UUID' })
  @ApiBody({ type: UpdateProductRequestDto })
  @ApiResponse({ status: 200, description: 'Updated product', type: ProductDto })
  @ApiResponse({ status: 403, description: 'Forbidden — admin role required', type: ApiErrorDto })
  @ApiResponse({ status: 404, description: 'Product not found', type: ApiErrorDto })
  async update(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() req: FastifyRequest & { correlationId?: string },
    @Res() res: FastifyReply,
    @CurrentUser() user: RequestUser,
  ) {
    const { status, data } = await this.proxyService.proxyToProducts({
      method: 'PATCH',
      path: `/products/${id}`,
      body,
      user,
      correlationId: req.correlationId,
    });
    return res.status(status).send(data);
  }

  @Delete(':id')
  @HttpCode(204)
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Delete a product (Admin only)', description: 'Requires the `admin` role.' })
  @ApiParam({ name: 'id', description: 'Product UUID' })
  @ApiResponse({ status: 204, description: 'Product deleted' })
  @ApiResponse({ status: 403, description: 'Forbidden — admin role required', type: ApiErrorDto })
  @ApiResponse({ status: 404, description: 'Product not found', type: ApiErrorDto })
  async remove(
    @Param('id') id: string,
    @Req() req: FastifyRequest & { correlationId?: string },
    @Res() res: FastifyReply,
    @CurrentUser() user: RequestUser,
  ) {
    const { status, data } = await this.proxyService.proxyToProducts({
      method: 'DELETE',
      path: `/products/${id}`,
      user,
      correlationId: req.correlationId,
    });
    return status === 204 ? res.status(204).send() : res.status(status).send(data);
  }
}
