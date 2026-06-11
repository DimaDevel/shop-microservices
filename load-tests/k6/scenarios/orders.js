/**
 * Orders scenario: end-to-end order creation through the full saga.
 *
 * Flow per VU: login → list products → create order → poll until non-pending.
 *
 * This is the slowest path (DB write + Kafka + stock reservation + payment).
 * Realistic target: 20–50 RPS at low concurrency; watch circuit breakers at GET /health.
 *
 * Uses per-VU accounts to avoid cross-VU order interference.
 */
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Trend, Counter } from 'k6/metrics';
import { register, authHeaders } from '../utils/auth.js';

const BASE_URL   = __ENV.API_URL || 'http://localhost:3000';
const JSON_HDRS  = { 'Content-Type': 'application/json' };

const sagaDuration  = new Trend('saga_duration_ms');
const sagaCompleted = new Counter('saga_completed');
const sagaFailed    = new Counter('saga_failed');

export const options = {
  stages: [
    { duration: '30s', target: 5  },
    { duration: '2m',  target: 20 },
    { duration: '30s', target: 0  },
  ],
  thresholds: {
    http_req_failed:  ['rate<0.05'],
    saga_duration_ms: ['p(95)<15000'],  // saga should complete within 15s
  },
};

export function setup() {
  const maxVUs = 20;
  for (let i = 0; i < maxVUs; i++) {
    register(BASE_URL, `bench-order-${i}@load.test`, 'BenchPass123!');
  }

  // Login as VU 0 to fetch a product ID for all VUs to share.
  const loginRes = http.post(
    `${BASE_URL}/auth/login`,
    JSON.stringify({ email: 'bench-order-0@load.test', password: 'BenchPass123!' }),
    { headers: JSON_HDRS },
  );
  const accessToken = loginRes.json('accessToken');
  const listRes = http.get(
    `${BASE_URL}/products?limit=1&offset=0`,
    { headers: authHeaders(accessToken) },
  );
  const items = listRes.json('data') || listRes.json();
  const productId = Array.isArray(items) && items.length > 0 ? items[0].id : null;
  return { productId };
}

export default function ({ productId }) {
  if (!productId) {
    console.error('No product found — seed the DB before running this scenario.');
    return;
  }

  const vuId    = __VU % 20;
  const email   = `bench-order-${vuId}@load.test`;
  const loginRes = http.post(
    `${BASE_URL}/auth/login`,
    JSON.stringify({ email, password: 'BenchPass123!' }),
    { headers: JSON_HDRS },
  );
  if (!check(loginRes, { 'login 200': (r) => r.status === 200 })) return;

  const accessToken = loginRes.json('accessToken');
  const headers     = authHeaders(accessToken);

  // Create order
  const createRes = http.post(
    `${BASE_URL}/orders`,
    JSON.stringify({ items: [{ productId, quantity: 1 }] }),
    { headers },
  );
  if (!check(createRes, { 'order created 202': (r) => r.status === 202 })) return;

  const orderId  = createRes.json('id');
  const startMs  = Date.now();

  // Poll until order leaves 'pending' (saga completed) or timeout
  let finalStatus = 'pending';
  for (let i = 0; i < 30; i++) {
    sleep(1);
    const pollRes = http.get(`${BASE_URL}/orders/${orderId}`, { headers });
    if (!check(pollRes, { 'poll 200': (r) => r.status === 200 })) break;
    finalStatus = pollRes.json('status');
    if (finalStatus !== 'pending') break;
  }

  sagaDuration.add(Date.now() - startMs);

  if (finalStatus === 'confirmed') {
    sagaCompleted.add(1);
  } else {
    sagaFailed.add(1);
  }

  sleep(2);
}
