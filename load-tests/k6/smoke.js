/**
 * Smoke test — 5 VUs for 30s, verifies the full stack is reachable before any real load run.
 * All checks must pass; any failure means the environment is broken, not slow.
 */
import http from 'k6/http';
import { check, sleep } from 'k6';
import { register, login, authHeaders } from './utils/auth.js';

const BASE_URL   = __ENV.API_URL || 'http://localhost:3000';
const BENCH_EMAIL = 'bench-smoke@load.test';
const BENCH_PASS  = 'BenchPass123!';

export const options = {
  vus:      5,
  duration: '30s',
  thresholds: {
    http_req_failed:   ['rate==0'],
    http_req_duration: ['p(99)<2000'],
  },
};

export function setup() {
  register(BASE_URL, BENCH_EMAIL, BENCH_PASS);
  const tokens = login(BASE_URL, BENCH_EMAIL, BENCH_PASS);
  return tokens;
}

export default function ({ accessToken }) {
  const headers = authHeaders(accessToken);

  // Health
  const healthRes = http.get(`${BASE_URL}/health`);
  check(healthRes, { 'health 200': (r) => r.status === 200 });

  sleep(0.5);

  // Products list
  const productsRes = http.get(`${BASE_URL}/products?limit=5&offset=0`, { headers });
  check(productsRes, { 'products 200': (r) => r.status === 200 });

  sleep(0.5);

  // Own profile
  const meRes = http.get(`${BASE_URL}/users/me`, { headers });
  check(meRes, { 'me 200': (r) => r.status === 200 });

  sleep(1);
}
