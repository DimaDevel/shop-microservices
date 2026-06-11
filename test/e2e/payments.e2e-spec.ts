import { api, uniqueEmail, registerUser, promoteToAdmin, pollUntil, ApiError } from './helpers';

describe('Payments / Wallet API (e2e)', () => {
  let userToken: string;
  let userId: string;
  let adminToken: string;

  beforeAll(async () => {
    const userTokens = await registerUser(uniqueEmail('wallet-user'));
    userToken = userTokens.accessToken;
    userId = userTokens.userId;

    const adminEmail = uniqueEmail('wallet-admin');
    await registerUser(adminEmail);
    const adminTokens = await promoteToAdmin(adminEmail);
    adminToken = adminTokens.accessToken;

    // Wallet is created by the USER_REGISTERED Kafka event — poll until it exists
    await pollUntil(
      () => api.get('/payments/wallet/me', userToken),
      (r) => r.status === 200,
      { maxAttempts: 15, intervalMs: 1000 },
    );
  });

  describe('GET /payments/wallet/me', () => {
    it('returns the wallet with the default seeded balance', async () => {
      const { status, body } = await api.get<{ userId: string; balance: number }>(
        '/payments/wallet/me',
        userToken,
      );

      expect(status).toBe(200);
      expect(body.userId).toBe(userId);
      expect(body.balance).toBeGreaterThan(0);
    });

    it('returns 401 without a token', async () => {
      const { status } = await api.get('/payments/wallet/me');

      expect(status).toBe(401);
    });
  });

  describe('GET /payments/wallet/:userId', () => {
    it('admin can read any user wallet', async () => {
      const { status, body } = await api.get<{ userId: string; balance: number }>(
        `/payments/wallet/${userId}`,
        adminToken,
      );

      expect(status).toBe(200);
      expect(body.userId).toBe(userId);
    });

    it('returns 403 when a non-admin requests another user wallet', async () => {
      const other = await registerUser(uniqueEmail('wallet-other'));
      const { status, body } = await api.get<ApiError>(
        `/payments/wallet/${other.userId}`,
        userToken,
      );

      expect(status).toBe(403);
      expect(body.code).toBe('FORBIDDEN');
    });

    it('returns 401 without a token', async () => {
      const { status } = await api.get(`/payments/wallet/${userId}`);

      expect(status).toBe(401);
    });
  });

  describe('POST /payments/wallet/:userId/top-up', () => {
    it('admin can top up a user wallet and the balance increases', async () => {
      const before = await api.get<{ balance: number }>('/payments/wallet/me', userToken);
      const previousBalance = before.body.balance;

      const { status, body } = await api.post<{ userId: string; balance: number }>(
        `/payments/wallet/${userId}/top-up`,
        { amount: 500 },
        adminToken,
      );

      expect(status).toBe(201);
      expect(body.userId).toBe(userId);
      expect(body.balance).toBeCloseTo(previousBalance + 500, 2);
    });

    it('returns 403 when a non-admin attempts to top up', async () => {
      const { status, body } = await api.post<ApiError>(
        `/payments/wallet/${userId}/top-up`,
        { amount: 100 },
        userToken,
      );

      expect(status).toBe(403);
      expect(body.code).toBe('FORBIDDEN');
    });

    it('returns 400 for an invalid amount (zero)', async () => {
      const { status } = await api.post(
        `/payments/wallet/${userId}/top-up`,
        { amount: 0 },
        adminToken,
      );

      expect(status).toBe(400);
    });

    it('returns 401 without a token', async () => {
      const { status } = await api.post(`/payments/wallet/${userId}/top-up`, { amount: 100 });

      expect(status).toBe(401);
    });
  });
});
