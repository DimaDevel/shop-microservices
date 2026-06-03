import { execSync } from 'child_process';

const BASE = process.env.API_URL ?? 'http://localhost';

interface HttpResponse<T = unknown> {
  status: number;
  body: T;
}

async function request<T = unknown>(
  method: string,
  path: string,
  opts: { body?: unknown; token?: string } = {},
): Promise<HttpResponse<T>> {
  const headers: Record<string, string> = {};
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
  if (opts.token) headers['Authorization'] = `Bearer ${opts.token}`;

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });

  let body: T;
  try {
    body = (await res.json()) as T;
  } catch {
    body = null as unknown as T;
  }

  return { status: res.status, body };
}

export const api = {
  get: <T = unknown>(path: string, token?: string) => request<T>('GET', path, { token }),
  post: <T = unknown>(path: string, body: unknown, token?: string) => request<T>('POST', path, { body, token }),
  patch: <T = unknown>(path: string, body: unknown, token?: string) => request<T>('PATCH', path, { body, token }),
  delete: <T = unknown>(path: string, token?: string) => request<T>('DELETE', path, { token }),
};

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  userId: string;
  email: string;
}

export interface ApiError {
  statusCode: number;
  code: string;
  message: string;
}

export function uniqueEmail(prefix = 'e2e'): string {
  return `${prefix}-${Date.now()}@test.example.com`;
}

export async function registerUser(email: string, password = 'password123'): Promise<AuthTokens> {
  const { body } = await api.post<AuthTokens>('/auth/register', { email, password });
  return body;
}

export async function loginUser(email: string, password = 'password123'): Promise<AuthTokens> {
  const { body } = await api.post<AuthTokens>('/auth/login', { email, password });
  return body;
}

export async function promoteToAdmin(email: string, password = 'password123'): Promise<AuthTokens> {
  execSync(
    `docker compose exec -T auth-db psql -U postgres -d auth_db -c "UPDATE users SET roles = '{admin,user}' WHERE email = '${email}'"`,
    { cwd: process.cwd(), stdio: 'pipe' },
  );
  return loginUser(email, password);
}

export async function pollUntil<T>(
  fn: () => Promise<T>,
  predicate: (result: T) => boolean,
  opts: { intervalMs?: number; maxAttempts?: number } = {},
): Promise<T> {
  const { intervalMs = 1000, maxAttempts = 15 } = opts;
  for (let i = 0; i < maxAttempts; i++) {
    const result = await fn();
    if (predicate(result)) return result;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error('pollUntil: condition never met within timeout');
}
