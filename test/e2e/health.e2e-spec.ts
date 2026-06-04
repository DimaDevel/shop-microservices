import { api } from './helpers';

describe('Health', () => {
  describe('GET /health', () => {
    it('returns 200 with ok status and circuit breaker info', async () => {
      const { status, body } = await api.get<{
        status: string;
        info: Record<string, unknown>;
        details: Record<string, unknown>;
      }>('/health');

      expect(status).toBe(200);
      expect(body.status).toBe('ok');
      expect(body.info).toBeDefined();
      expect(body.details).toBeDefined();
    });
  });
});
