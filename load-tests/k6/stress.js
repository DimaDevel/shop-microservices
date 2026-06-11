/**
 * Stress test — finds the saturation point by ramping to 500 VUs.
 *
 * Watch alongside this run:
 *   docker stats                     — container CPU/memory
 *   curl localhost:3000/health        — circuit breaker state per service
 *
 * The test deliberately pushes past comfortable limits; expect some failures at peak.
 * The goal is to identify the VU count at which error rate crosses 1% or p99 > 1s.
 */
import http from 'k6/http';
import { check, sleep } from 'k6';
import { register, login, authHeaders } from './utils/auth.js';

const BASE_URL    = __ENV.API_URL || 'http://localhost:3000';
const BENCH_EMAIL = 'bench-stress@load.test';
const BENCH_PASS  = 'BenchPass123!';

export const options = {
  stages: [
    { duration: '1m',  target: 50  },   // warm-up
    { duration: '2m',  target: 150 },   // moderate load
    { duration: '2m',  target: 300 },   // heavy load
    { duration: '2m',  target: 500 },   // saturation
    { duration: '1m',  target: 0   },   // cool-down
  ],
  thresholds: {
    // Informational only — we expect these to break at peak, that's the point.
    http_req_duration: ['p(99)<2000'],
    http_req_failed:   ['rate<0.10'],
  },
};

export function setup() {
  register(BASE_URL, BENCH_EMAIL, BENCH_PASS);
  const tokens = login(BASE_URL, BENCH_EMAIL, BENCH_PASS);
  return tokens;
}

export default function ({ accessToken }) {
  const headers = authHeaders(accessToken);

  // Products list — cacheable, represents best-case gateway throughput.
  const res = http.get(`${BASE_URL}/products?limit=20&offset=0`, { headers });
  check(res, { 'status 200': (r) => r.status === 200 });

  sleep(0.1);
}
