/**
 * Auth scenario: login → use access token → refresh token rotation
 *
 * Measures the auth service under concurrent authentication load.
 * Each VU gets a unique account to avoid refresh-token conflicts
 * (the DB stores only one refresh token per user at a time).
 */
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter } from 'k6/metrics';
import { register, authHeaders } from '../utils/auth.js';

const BASE_URL = __ENV.API_URL || 'http://localhost:3000';
const JSON_HEADERS = { 'Content-Type': 'application/json' };

const refreshErrors = new Counter('refresh_errors');

export const options = {
  stages: [
    { duration: '30s', target: 20 },
    { duration: '1m',  target: 50 },
    { duration: '30s', target: 0 },
  ],
  thresholds: {
    http_req_duration: ['p(95)<800'],
    http_req_failed:   ['rate<0.02'],
    refresh_errors:    ['count<5'],
  },
};

// setup() runs once before VUs start — seed one account per VU slot.
export function setup() {
  const maxVUs = 50;
  for (let i = 0; i < maxVUs; i++) {
    register(BASE_URL, `bench-auth-${i}@load.test`, 'BenchPass123!');
  }
}

export default function () {
  const vuId = __VU % 50;
  const email = `bench-auth-${vuId}@load.test`;
  const password = 'BenchPass123!';

  // 1. Login
  const loginRes = http.post(
    `${BASE_URL}/auth/login`,
    JSON.stringify({ email, password }),
    { headers: JSON_HEADERS },
  );
  const loginOk = check(loginRes, { 'login 200': (r) => r.status === 200 });
  if (!loginOk) return;

  const accessToken = loginRes.json('accessToken');
  const refreshToken = loginRes.json('refreshToken');

  sleep(0.5);

  // 2. Use the access token
  const meRes = http.get(`${BASE_URL}/users/me`, { headers: authHeaders(accessToken) });
  check(meRes, { 'me 200': (r) => r.status === 200 });

  sleep(0.5);

  // 3. Refresh the token
  const refreshRes = http.post(
    `${BASE_URL}/auth/refresh`,
    JSON.stringify({ refreshToken }),
    { headers: JSON_HEADERS },
  );
  const refreshOk = check(refreshRes, { 'refresh 200': (r) => r.status === 200 });
  if (!refreshOk) refreshErrors.add(1);

  sleep(1);
}
