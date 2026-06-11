import http from 'k6/http';
import { check } from 'k6';

const JSON_HEADERS = { 'Content-Type': 'application/json' };

// Registers a bench user if they don't exist yet, then returns { accessToken, refreshToken }.
export function login(baseUrl, email, password) {
  const res = http.post(
    `${baseUrl}/auth/login`,
    JSON.stringify({ email, password }),
    { headers: JSON_HEADERS },
  );
  check(res, { 'login 200': (r) => r.status === 200 });
  const body = res.json();
  return { accessToken: body.accessToken, refreshToken: body.refreshToken };
}

export function register(baseUrl, email, password) {
  const res = http.post(
    `${baseUrl}/auth/register`,
    JSON.stringify({ email, password }),
    { headers: JSON_HEADERS },
  );
  // 201 = created, 409 = already exists — both are fine for setup
  check(res, { 'register ok': (r) => r.status === 201 || r.status === 409 });
}

export function authHeaders(accessToken) {
  return { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' };
}
