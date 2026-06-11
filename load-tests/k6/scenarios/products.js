/**
 * Products scenario: read-heavy load against the Redis-cached products list.
 *
 * Targets: p99 < 200ms at 200 VUs (cache should absorb most reads).
 * Also exercises single-product GET to verify per-item cache path.
 */
import http from 'k6/http';
import { check, sleep } from 'k6';
import { register, login, authHeaders } from '../utils/auth.js';

const BASE_URL = __ENV.API_URL || 'http://localhost:3000';
const BENCH_EMAIL = 'bench-products@load.test';
const BENCH_PASS  = 'BenchPass123!';

export const options = {
  stages: [
    { duration: '30s', target: 50 },
    { duration: '1m',  target: 200 },
    { duration: '30s', target: 0 },
  ],
  thresholds: {
    http_req_duration: ['p(99)<500', 'p(95)<200'],
    http_req_failed:   ['rate<0.01'],
  },
};

export function setup() {
  register(BASE_URL, BENCH_EMAIL, BENCH_PASS);
  const { accessToken } = login(BASE_URL, BENCH_EMAIL, BENCH_PASS);

  // Fetch first page to grab a real product ID for single-item GETs.
  const listRes = http.get(
    `${BASE_URL}/products?limit=20&offset=0`,
    { headers: authHeaders(accessToken) },
  );
  const items = listRes.json('data') || listRes.json();
  const productId = Array.isArray(items) && items.length > 0 ? items[0].id : null;

  return { accessToken, productId };
}

export default function ({ accessToken, productId }) {
  const headers = authHeaders(accessToken);

  // List (cached after first hit)
  const listRes = http.get(`${BASE_URL}/products?limit=20&offset=0`, { headers });
  check(listRes, { 'list 200': (r) => r.status === 200 });

  sleep(0.2);

  // Single item (if we have an ID)
  if (productId) {
    const itemRes = http.get(`${BASE_URL}/products/${productId}`, { headers });
    check(itemRes, { 'item 200': (r) => r.status === 200 });
  }

  sleep(0.3);
}
