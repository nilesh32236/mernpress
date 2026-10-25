import type { CookieSerializeOptions } from '@fastify/cookie';
import type { Env } from '../config/env.js';

export const SESSION_COOKIE = 'mernpress_session';

/**
 * Session-bound CSRF token. Readable by the admin (same origin) because it is
 * sent back in `X-CSRF-Token`. Only set at login and only cleared at logout or
 * when the session is rejected.
 */
export const CSRF_COOKIE = 'mernpress_csrf';

/**
 * Login double-submit token. Kept separate from the session-bound cookie so
 * `GET /api/auth/csrf` can be called while authenticated without invalidating
 * the token required by logout.
 */
export const PREAUTH_CSRF_COOKIE = 'mernpress_csrf_preauth';
export const PREAUTH_CSRF_TTL_SECONDS = 10 * 60;

function baseOptions(env: Env): CookieSerializeOptions {
  return {
    secure: env.NODE_ENV === 'production',
    sameSite: 'lax',
  };
}

export function sessionCookieOptions(env: Env, maxAgeSeconds: number): CookieSerializeOptions {
  return {
    ...baseOptions(env),
    path: '/api',
    httpOnly: true,
    maxAge: maxAgeSeconds,
  };
}

export function csrfCookieOptions(env: Env, maxAgeSeconds: number): CookieSerializeOptions {
  return {
    ...baseOptions(env),
    path: '/',
    httpOnly: false,
    maxAge: maxAgeSeconds,
  };
}

export function clearSessionCookieOptions(env: Env): CookieSerializeOptions {
  return {
    ...baseOptions(env),
    path: '/api',
    httpOnly: true,
  };
}

export function clearCsrfCookieOptions(env: Env): CookieSerializeOptions {
  return {
    ...baseOptions(env),
    path: '/',
    httpOnly: false,
  };
}
