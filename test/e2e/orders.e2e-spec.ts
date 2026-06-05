import { api, uniqueEmail, registerUser, promoteToAdmin, pollUntil, ApiError } from './helpers';

describe('Orders API (e2e)', () => {
  let userToken: string;
  let adminToken: string;
  let affordableProductId: string;
  let expensiveProductId: string;

  beforeAll(async () => {
    const userTokens = await registerUser(uniqueEmail('orders-user'));
    userToken = userTokens.accessToken;

    const adminEmail = uniqueEmail('orders-admin');
    await registerUser(adminEmail);
    const adminTokens = await promoteToAdmin(adminEmail);
    adminToken = adminTokens.accessToken;

    // Create two products: one cheap (payment succeeds), one expensive (payment fails)
    const cheap = await api.post<{ id: string }>(
      '/products',
      { name: 'Cheap Widget', description: 'Test', price: 9.99, stock: 50 },
      adminToken,
    );
    affordableProductId = cheap.body.id;

    const expensive = await api.post<{ id: string }>(
      '/products',
      { name: 'Expensive Server', description: 'Test', price: 9999.99, stock: 5 },
      adminToken,
    );
    expensiveProductId = expensive.body.id;
  });

  afterAll(async () => {
    await api.delete(`/products/${affordableProductId}`, adminToken);
    await api.delete(`/products/${expensiveProductId}`, adminToken);
  });

  describe('POST /orders', () => {
    it('returns 401 without token', async () => {
      const { status } = await api.post('/orders', {
        items: [{ productId: affordableProductId, quantity: 1 }],
      });

      expect(status).toBe(401);
    });

    it('returns 400 when items array is empty', async () => {
      const { status, body } = await api.post<ApiError>('/orders', { items: [] }, userToken);

      expect(status).toBe(400);
      expect(body.code).toBe('BAD_REQUEST');
    });

    it('creates an order and saga confirms it (happy path)', async () => {
      const { status, body } = await api.post<{ id: string; status: string }>(
        '/orders',
        { items: [{ productId: affordableProductId, quantity: 2 }] },
        userToken,
      );

      expect(status).toBe(202);
      expect(body.id).toBeTruthy();
      expect(body.status).toBe('pending');

      const orderId = body.id;

      const confirmed = await pollUntil(
        () => api.get<{ id: string; status: string; total: number }>(`/orders/${orderId}`, userToken),
        (r) => r.body.status !== 'pending',
        { maxAttempts: 15, intervalMs: 1000 },
      );

      expect(confirmed.body.status).toBe('confirmed');
      expect(confirmed.body.total).toBeCloseTo(2 * 9.99, 1);
    });

    it('cancels the order when payment fails (total >= 10000)', async () => {
      const { status, body } = await api.post<{ id: string; status: string }>(
        '/orders',
        { items: [{ productId: expensiveProductId, quantity: 2 }] },
        userToken,
      );

      expect(status).toBe(202);
      expect(body.status).toBe('pending');

      const orderId = body.id;

      // Order briefly becomes 'confirmed' when stock is reserved,
      // then 'cancelled' once payment fails and stock is released.
      const cancelled = await pollUntil(
        () => api.get<{ id: string; status: string }>(`/orders/${orderId}`, userToken),
        (r) => r.body.status === 'cancelled',
        { maxAttempts: 20, intervalMs: 1000 },
      );

      expect(cancelled.body.status).toBe('cancelled');
    });
  });

  describe('GET /orders', () => {
    it('returns a paginated list of orders for the authenticated user', async () => {
      const { status, body } = await api.get<{ data: unknown[]; meta: { page: number; limit: number; total: number; totalPages: number } }>('/orders', userToken);

      expect(status).toBe(200);
      expect(Array.isArray(body.data)).toBe(true);
      expect(body.data.length).toBeGreaterThanOrEqual(1);
      expect(body.meta).toMatchObject({ page: 1, limit: 20 });
    });

    it('returns 401 without token', async () => {
      const { status } = await api.get('/orders');

      expect(status).toBe(401);
    });
  });

  describe('GET /orders/:id', () => {
    it('returns an order by id', async () => {
      const created = await api.post<{ id: string }>('/orders', {
        items: [{ productId: affordableProductId, quantity: 1 }],
        }, userToken);

      const orderId = created.body.id;

      const { status, body } = await api.get<{ id: string; status: string; items: unknown[] }>(
        `/orders/${orderId}`,
        userToken,
      );

      expect(status).toBe(200);
      expect(body.id).toBe(orderId);
      expect(Array.isArray(body.items)).toBe(true);
    });

    it('returns 404 for non-existent order', async () => {
      const { status, body } = await api.get<ApiError>(
        '/orders/00000000-0000-0000-0000-000000000000',
        userToken,
      );

      expect(status).toBe(404);
      expect(body.code).toBe('NOT_FOUND');
    });

    it('returns 401 without token', async () => {
      const created = await api.post<{ id: string }>(
        '/orders',
        { items: [{ productId: affordableProductId, quantity: 1 }] },
        userToken,
      );

      const { status } = await api.get(`/orders/${created.body.id}`);

      expect(status).toBe(401);
    });

    it('returns 404 when accessing another user\'s order', async () => {
      const otherTokens = await registerUser(uniqueEmail('orders-other'));
      const created = await api.post<{ id: string }>(
        '/orders',
        { items: [{ productId: affordableProductId, quantity: 1 }] },
        userToken,
      );

      const { status, body } = await api.get<ApiError>(
        `/orders/${created.body.id}`,
        otherTokens.accessToken,
      );

      expect(status).toBe(404);
      expect(body.code).toBe('NOT_FOUND');
    });
  });
});
