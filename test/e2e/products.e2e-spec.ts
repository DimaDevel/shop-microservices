import { api, uniqueEmail, registerUser, promoteToAdmin, ApiError } from './helpers';

describe('Products API (e2e)', () => {
  let userToken: string;
  let adminToken: string;
  let createdProductId: string;

  const newProduct = {
    name: 'E2E Widget',
    description: 'Created by e2e test',
    price: 49.99,
    stock: 100,
  };

  beforeAll(async () => {
    const userTokens = await registerUser(uniqueEmail('products-user'));
    userToken = userTokens.accessToken;

    const adminEmail = uniqueEmail('products-admin');
    await registerUser(adminEmail);
    const adminTokens = await promoteToAdmin(adminEmail);
    adminToken = adminTokens.accessToken;
  });

  describe('GET /products', () => {
    it('returns an array of products for authenticated user', async () => {
      const { status, body } = await api.get<unknown[]>('/products', userToken);

      expect(status).toBe(200);
      expect(Array.isArray(body)).toBe(true);
    });

    it('returns 401 without token', async () => {
      const { status, body } = await api.get<ApiError>('/products');

      expect(status).toBe(401);
      expect(body.code).toBe('UNAUTHORIZED');
    });
  });

  describe('POST /products', () => {
    it('returns 403 for non-admin user', async () => {
      const { status, body } = await api.post<ApiError>('/products', newProduct, userToken);

      expect(status).toBe(403);
      expect(body.code).toBe('FORBIDDEN');
    });

    it('creates a product when called by admin', async () => {
      const { status, body } = await api.post<{
        id: string;
        name: string;
        price: number;
        stock: number;
        isActive: boolean;
      }>('/products', newProduct, adminToken);

      expect(status).toBe(201);
      expect(body.id).toBeTruthy();
      expect(body.name).toBe(newProduct.name);
      expect(body.price).toBe(newProduct.price);
      expect(body.stock).toBe(newProduct.stock);
      expect(body.isActive).toBe(true);

      createdProductId = body.id;
    });

    it('returns 400 when required fields are missing', async () => {
      const { status, body } = await api.post<ApiError>(
        '/products',
        { name: 'Missing price and stock' },
        adminToken,
      );

      expect(status).toBe(400);
      expect(body.code).toBe('BAD_REQUEST');
    });
  });

  describe('GET /products/:id', () => {
    it('returns the product by id', async () => {
      const { status, body } = await api.get<{ id: string; name: string }>(
        `/products/${createdProductId}`,
        userToken,
      );

      expect(status).toBe(200);
      expect(body.id).toBe(createdProductId);
      expect(body.name).toBe(newProduct.name);
    });

    it('returns 404 for non-existent product', async () => {
      const { status, body } = await api.get<ApiError>(
        '/products/00000000-0000-0000-0000-000000000000',
        userToken,
      );

      expect(status).toBe(404);
      expect(body.code).toBe('NOT_FOUND');
    });
  });

  describe('PATCH /products/:id', () => {
    it('updates price and preserves other fields', async () => {
      const { status, body } = await api.patch<{
        id: string;
        name: string;
        description: string;
        price: number;
        stock: number;
      }>(`/products/${createdProductId}`, { price: 39.99 }, adminToken);

      expect(status).toBe(200);
      expect(body.price).toBe(39.99);
      expect(body.name).toBe(newProduct.name);
      expect(body.description).toBe(newProduct.description);
      expect(body.stock).toBe(newProduct.stock);
    });

    it('returns 403 for non-admin', async () => {
      const { status, body } = await api.patch<ApiError>(
        `/products/${createdProductId}`,
        { price: 1 },
        userToken,
      );

      expect(status).toBe(403);
      expect(body.code).toBe('FORBIDDEN');
    });

    it('returns 404 for non-existent product', async () => {
      const { status, body } = await api.patch<ApiError>(
        '/products/00000000-0000-0000-0000-000000000000',
        { price: 1 },
        adminToken,
      );

      expect(status).toBe(404);
      expect(body.code).toBe('NOT_FOUND');
    });
  });

  describe('DELETE /products/:id', () => {
    it('deletes the product and returns 204', async () => {
      const { status } = await api.delete(`/products/${createdProductId}`, adminToken);

      expect(status).toBe(204);
    });

    it('returns 404 when deleting an already-deleted product', async () => {
      const { status, body } = await api.delete<ApiError>(
        `/products/${createdProductId}`,
        adminToken,
      );

      expect(status).toBe(404);
      expect(body.code).toBe('NOT_FOUND');
    });

    it('returns 403 for non-admin', async () => {
      const product = await api.post<{ id: string }>(
        '/products',
        { name: 'To delete', description: 'x', price: 1, stock: 1 },
        adminToken,
      );

      const { status } = await api.delete(`/products/${product.body.id}`, userToken);
      expect(status).toBe(403);

      // Cleanup
      await api.delete(`/products/${product.body.id}`, adminToken);
    });
  });
});
