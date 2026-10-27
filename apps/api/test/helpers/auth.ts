import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../src/app.js';
import type { Env } from '../../src/config/env.js';
import { makeTestEnv } from './env.js';

export const ADMIN_ORIGIN = 'http://127.0.0.1:5173';
export const ADMIN_USERNAME = 'admin';
export const ADMIN_PASSWORD = 'Correct horse battery staple';

export async function createTestApp(
  options: {
    now?: () => Date;
    loggerStream?: { write(message: string): void };
  } & Partial<Env> = {},
): Promise<FastifyInstance> {
  const { now, loggerStream, ...envOverrides } = options;
  const app = await buildApp({
    env: makeTestEnv(envOverrides),
    logger: false,
    ...(now === undefined ? {} : { now }),
    ...(loggerStream === undefined ? {} : { loggerStream }),
  });

  await resetAuthTables(app);
  return app;
}

export async function resetAuthTables(app: FastifyInstance): Promise<void> {
  await app.database.$executeRaw`
    TRUNCATE TABLE
      "post_terms", "post_slug_history", "terms", "posts",
      "audit_events", "sessions", "login_attempts", "users"
    RESTART IDENTITY CASCADE
  `;
}

export async function seedAdmin(
  app: FastifyInstance,
  username = ADMIN_USERNAME,
  password = ADMIN_PASSWORD,
) {
  return app.auth.bootstrapAdmin({ username, password });
}

export async function getCsrf(app: FastifyInstance): Promise<{
  token: string;
  cookieHeader: string;
}> {
  const response = await app.inject({ method: 'GET', url: '/api/auth/csrf' });
  const body = response.json() as { csrfToken: string };
  const cookie = response.cookies.find((entry) => entry.name === 'mernpress_csrf_preauth');

  if (!cookie) {
    throw new Error('Pre-auth CSRF cookie was not set');
  }

  return {
    token: body.csrfToken,
    cookieHeader: `mernpress_csrf_preauth=${cookie.value}`,
  };
}

export async function loginAs(
  app: FastifyInstance,
  username: string,
  password: string,
  origin = ADMIN_ORIGIN,
) {
  const csrf = await getCsrf(app);
  const response = await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    headers: {
      origin,
      'x-csrf-token': csrf.token,
      cookie: csrf.cookieHeader,
      'content-type': 'application/json',
    },
    payload: { username, password },
  });

  // A successful login sets the session cookie and the session-bound CSRF
  // cookie and clears the pre-auth cookie. Failed logins set nothing, so the
  // returned header is then only useful for assertions, not for reuse.
  const responseCookies = response.cookies
    .filter((entry) => entry.value !== '')
    .map((entry) => `${entry.name}=${entry.value}`);
  const body = response.json() as { csrfToken?: string };

  return {
    response,
    cookieHeader: responseCookies.join('; '),
    csrfToken: body.csrfToken ?? csrf.token,
  };
}

export async function getSession(app: FastifyInstance, cookieHeader: string) {
  return app.inject({
    method: 'GET',
    url: '/api/auth/session',
    headers: { cookie: cookieHeader },
  });
}

export async function logoutAs(app: FastifyInstance, cookieHeader: string, csrfToken: string) {
  return app.inject({
    method: 'POST',
    url: '/api/auth/logout',
    headers: {
      origin: ADMIN_ORIGIN,
      cookie: cookieHeader,
      'x-csrf-token': csrfToken,
    },
  });
}

export function setCookieHeader(response: { headers: Record<string, unknown> }): string {
  const value = response.headers['set-cookie'];
  if (Array.isArray(value)) {
    return value.join('\n');
  }
  return typeof value === 'string' ? value : '';
}

export function findSetCookie(
  response: { headers: Record<string, unknown> },
  name: string,
): string {
  return (
    setCookieHeader(response)
      .split('\n')
      .find((line) => line.startsWith(`${name}=`)) ?? ''
  );
}
