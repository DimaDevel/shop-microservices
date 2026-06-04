import { api, uniqueEmail, registerUser, loginUser, ApiError, AuthTokens } from './helpers';

describe('Auth API (e2e)', () => {
  const email = uniqueEmail('auth');
  const password = 'securePass123';

  describe('POST /auth/register', () => {
    it('creates a new user and returns tokens', async () => {
      const { status, body } = await api.post<AuthTokens>('/auth/register', { email, password });

      expect(status).toBe(201);
      expect(body.accessToken).toBeTruthy();
      expect(body.refreshToken).toBeTruthy();
      expect(body.userId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
      );
      expect(body.email).toBe(email);
    });

    it('returns 409 CONFLICT on duplicate email', async () => {
      const { status, body } = await api.post<ApiError>('/auth/register', { email, password });

      expect(status).toBe(409);
      expect(body.code).toBe('CONFLICT');
      expect(body.message).toBeTruthy();
    });

    it('returns 400 on missing password', async () => {
      const { status, body } = await api.post<ApiError>('/auth/register', { email: uniqueEmail() });

      expect(status).toBe(400);
      expect(body.code).toBe('BAD_REQUEST');
    });

    it('returns 400 when password is too short', async () => {
      const { status, body } = await api.post<ApiError>('/auth/register', {
        email: uniqueEmail(),
        password: 'short',
      });

      expect(status).toBe(400);
      expect(body.code).toBe('BAD_REQUEST');
    });

    it('returns 400 for invalid email format', async () => {
      const { status, body } = await api.post<ApiError>('/auth/register', {
        email: 'not-an-email',
        password: 'securePass123',
      });

      expect(status).toBe(400);
      expect(body.code).toBe('BAD_REQUEST');
    });

    it('returns 400 when email is missing', async () => {
      const { status, body } = await api.post<ApiError>('/auth/register', {
        password: 'securePass123',
      });

      expect(status).toBe(400);
      expect(body.code).toBe('BAD_REQUEST');
    });
  });

  describe('POST /auth/login', () => {
    it('returns tokens for valid credentials', async () => {
      const { status, body } = await api.post<AuthTokens>('/auth/login', { email, password });

      expect(status).toBe(200);
      expect(body.accessToken).toBeTruthy();
      expect(body.refreshToken).toBeTruthy();
      expect(body.email).toBe(email);
    });

    it('returns 401 for wrong password', async () => {
      const { status, body } = await api.post<ApiError>('/auth/login', {
        email,
        password: 'wrongPassword1',
      });

      expect(status).toBe(401);
      expect(body.code).toBe('UNAUTHORIZED');
    });

    it('returns 401 for unknown email', async () => {
      const { status, body } = await api.post<ApiError>('/auth/login', {
        email: 'nobody@example.com',
        password: 'somePassword1',
      });

      expect(status).toBe(401);
      expect(body.code).toBe('UNAUTHORIZED');
    });

    it('returns 400 when required fields are missing', async () => {
      const { status, body } = await api.post<ApiError>('/auth/login', {});

      expect(status).toBe(400);
      expect(body.code).toBe('BAD_REQUEST');
    });
  });

  describe('POST /auth/refresh', () => {
    it('issues a new token pair from a valid refresh token', async () => {
      const tokens = await loginUser(email, password);

      const { status, body } = await api.post<AuthTokens>('/auth/refresh', {
        refreshToken: tokens.refreshToken,
      });

      expect(status).toBe(200);
      expect(body.accessToken).toBeTruthy();
      expect(body.refreshToken).toBeTruthy();
      expect(body.accessToken).not.toBe(tokens.accessToken);
    });

    it('returns 401 for an invalid refresh token', async () => {
      const { status, body } = await api.post<ApiError>('/auth/refresh', {
        refreshToken: 'not.a.valid.jwt',
      });

      expect(status).toBe(401);
      expect(body.code).toBe('UNAUTHORIZED');
    });

    it('returns 401 when using the same refresh token twice (rotation)', async () => {
      const tokens = await loginUser(email, password);
      // Use the refresh token once (this rotates it)
      await api.post('/auth/refresh', { refreshToken: tokens.refreshToken });
      // Second use of the same token must fail
      const { status, body } = await api.post<ApiError>('/auth/refresh', {
        refreshToken: tokens.refreshToken,
      });

      expect(status).toBe(401);
      expect(body.code).toBe('UNAUTHORIZED');
    });
  });

  describe('POST /auth/logout', () => {
    it('returns 200 and invalidates the session', async () => {
      const tokens = await loginUser(email, password);

      const { status } = await api.post('/auth/logout', {}, tokens.accessToken);
      expect(status).toBe(200);

      // Refresh token must now be invalid
      const { status: refreshStatus } = await api.post('/auth/refresh', {
        refreshToken: tokens.refreshToken,
      });
      expect(refreshStatus).toBe(401);
    });

    it('returns 401 without a token', async () => {
      const { status } = await api.post('/auth/logout', {});
      expect(status).toBe(401);
    });
  });

  describe('Protected endpoint access', () => {
    it('returns 401 when Authorization header is absent', async () => {
      const { status, body } = await api.get<ApiError>('/users/me');

      expect(status).toBe(401);
      expect(body.code).toBe('UNAUTHORIZED');
    });

    it('returns 401 for a malformed token', async () => {
      const { status, body } = await api.get<ApiError>('/users/me', 'not.a.real.token');

      expect(status).toBe(401);
      expect(body.code).toBe('UNAUTHORIZED');
    });
  });
});
