import { api, uniqueEmail, registerUser, pollUntil, ApiError } from './helpers';

describe('Users API (e2e)', () => {
  let token: string;
  let userId: string;

  beforeAll(async () => {
    const tokens = await registerUser(uniqueEmail('users'));
    token = tokens.accessToken;
    userId = tokens.userId;

    // Profile creation is driven by a Kafka USER_REGISTERED event.
    // Poll until the user-service has processed it.
    await pollUntil(
      () => api.get(`/users/${userId}`, token),
      (r) => r.status === 200,
      { maxAttempts: 15, intervalMs: 1000 },
    );
  });

  describe('GET /users/me', () => {
    it('returns own profile', async () => {
      const { status, body } = await api.get<{ id: string; email: string; isActive: boolean }>(
        '/users/me',
        token,
      );

      expect(status).toBe(200);
      expect(body.id).toBe(userId);
      expect(body.isActive).toBe(true);
    });

    it('returns 401 without token', async () => {
      const { status, body } = await api.get<ApiError>('/users/me');

      expect(status).toBe(401);
      expect(body.code).toBe('UNAUTHORIZED');
    });
  });

  describe('GET /users/:id', () => {
    it('returns own profile by id', async () => {
      const { status, body } = await api.get<{ id: string }>(`/users/${userId}`, token);

      expect(status).toBe(200);
      expect(body.id).toBe(userId);
    });

    it('returns 404 for non-existent user', async () => {
      const { status, body } = await api.get<ApiError>(
        '/users/00000000-0000-0000-0000-000000000000',
        token,
      );

      expect(status).toBe(404);
      expect(body.code).toBe('NOT_FOUND');
    });

    it('returns 403 when accessing another real user without admin role', async () => {
      const other = await registerUser(uniqueEmail('users-other'));
      // Wait for the Kafka USER_REGISTERED event to create the other user's profile
      await pollUntil(
        () => api.get(`/users/${other.userId}`, other.accessToken),
        (r) => r.status === 200,
        { maxAttempts: 15, intervalMs: 1000 },
      );

      const { status, body } = await api.get<ApiError>(`/users/${other.userId}`, token);

      expect(status).toBe(403);
      expect(body.code).toBe('FORBIDDEN');
    });
  });

  describe('PATCH /users/:id', () => {
    it('updates own profile and returns updated fields', async () => {
      const { status, body } = await api.patch<{ id: string; name: string; city: string }>(
        `/users/${userId}`,
        { name: 'E2E User', city: 'Kyiv', country: 'UA' },
        token,
      );

      expect(status).toBe(200);
      expect(body.id).toBe(userId);
      expect(body.name).toBe('E2E User');
      expect(body.city).toBe('Kyiv');
    });

    it('partial update preserves unchanged fields', async () => {
      await api.patch(`/users/${userId}`, { name: 'Preserved Name' }, token);

      const { body } = await api.patch<{ name: string; city: string }>(
        `/users/${userId}`,
        { city: 'Lviv' },
        token,
      );

      expect(body.name).toBe('Preserved Name');
      expect(body.city).toBe('Lviv');
    });

    it('returns 403 when updating another real user', async () => {
      const other = await registerUser(uniqueEmail('users-patch-other'));
      await pollUntil(
        () => api.get(`/users/${other.userId}`, other.accessToken),
        (r) => r.status === 200,
        { maxAttempts: 15, intervalMs: 1000 },
      );

      const { status, body } = await api.patch<ApiError>(
        `/users/${other.userId}`,
        { name: 'Hijacked' },
        token,
      );

      expect(status).toBe(403);
      expect(body.code).toBe('FORBIDDEN');
    });

    it('returns 401 without token', async () => {
      const { status } = await api.patch(`/users/${userId}`, { name: 'No token' });

      expect(status).toBe(401);
    });
  });
});
