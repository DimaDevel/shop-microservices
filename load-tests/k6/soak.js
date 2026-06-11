/**
 * Soak test — 100 VUs for 30 minutes.
 *
 * Detects memory leaks, connection pool exhaustion, and DB connection drift
 * that only appear under sustained load, not in short stress runs.
 *
 * Run with: k6 run --env API_URL=http://localhost:3000 load-tests/k6/soak.js
 * Monitor:  docker stats --no-stream (run periodically) or watch docker stats
 */
import http from 'k6/http';
import { check, sleep } from 'k6';
import { register, login, authHeaders } from './utils/auth.js';

const BASE_URL    = __ENV.API_URL || 'http://localhost:3000';
const BENCH_EMAIL = 'bench-soak@load.test';
const BENCH_PASS  = 'BenchPass123!';

export const options = {
  stages: [
    { duration: '5m',  target: 100 },   // ramp up
    { duration: '20m', target: 100 },   // sustained load
    { duration: '5m',  target: 0   },   // ramp down
  ],
  thresholds: {
    http_req_duration: ['p(99)<1000'],
    http_req_failed:   ['rate<0.01'],
  },
};

export function setup() {
  register(BASE_URL, BENCH_EMAIL, BENCH_PASS);
  const tokens = login(BASE_URL, BENCH_EMAIL, BENCH_PASS);
  return tokens;
}

export default function ({ accessToken }) {
  const headers = authHeaders(accessToken);

  // Mix of reads to exercise cache, DB, and proxy paths.
  const productsRes = http.get(`${BASE_URL}/products?limit=20&offset=0`, { headers });
  check(productsRes, { 'products 200': (r) => r.status === 200 });

  sleep(0.5);

  const healthRes = http.get(`${BASE_URL}/health`);
  check(healthRes, { 'health 200': (r) => r.status === 200 });

  sleep(0.5);

  const meRes = http.get(`${BASE_URL}/users/me`, { headers });
  check(meRes, { 'me 200': (r) => r.status === 200 });

  sleep(1);
}
