import {
  AuthError,
  generateOpaqueToken,
  hashCsrfToken,
  safeEqualHex,
  verifyCsrfToken,
  type AuthService,
} from '@mernpress/cms-core';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import {
  clearCsrfCookieOptions,
  clearSessionCookieOptions,
  csrfCookieOptions,
  CSRF_COOKIE,
  PREAUTH_CSRF_COOKIE,
  PREAUTH_CSRF_TTL_SECONDS,
  SESSION_COOKIE,
  sessionCookieOptions,
} from '../auth/cookies.js';
import type { Env } from '../config/env.js';

const loginSchema = z
  .object({
    username: z.string().min(1).max(254),
    password: z.string().min(1).max(128),
    remember: z.boolean().optional(),
  })
  .strict();

interface AuthRouteOptions {
  env: Env;
  auth: AuthService;
}

function noStore(reply: FastifyReply): void {
  reply.header('cache-control', 'no-store');
}

function cookieValue(request: FastifyRequest, name: string): string | undefined {
  const value = request.cookies[name];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function csrfHeader(request: FastifyRequest): string | undefined {
  const value = request.headers['x-csrf-token'];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function preAuthCsrfValid(request: FastifyRequest): boolean {
  const cookie = cookieValue(request, PREAUTH_CSRF_COOKIE);
  const header = csrfHeader(request);

  if (!cookie || !header) {
    return false;
  }

  return safeEqualHex(hashCsrfToken(header), hashCsrfToken(cookie));
}

function sendError(
  reply: FastifyReply,
  request: FastifyRequest,
  statusCode: number,
  code: string,
  message: string,
): FastifyReply {
  noStore(reply);
  return reply.code(statusCode).send({
    error: {
      code,
      message,
      requestId: request.id,
    },
  });
}

function handleAuthError(
  error: unknown,
  reply: FastifyReply,
  request: FastifyRequest,
): FastifyReply {
  if (error instanceof AuthError) {
    if (error.retryAfterSeconds !== undefined) {
      reply.header('retry-after', String(error.retryAfterSeconds));
    }
    return sendError(reply, request, error.statusCode, error.code, error.message);
  }

  throw error;
}

export function registerAuthRoutes(app: FastifyInstance, options: AuthRouteOptions): void {
  const { env, auth } = options;

  // Login-token bootstrap for anonymous and authenticated callers. It writes
  // only the pre-auth cookie: it never reads, rotates or clears the session or
  // the session-bound CSRF cookie, so calling it after login cannot break
  // logout and the GET does not mutate server-side session state.
  app.get('/api/auth/csrf', async (_request, reply) => {
    const csrfToken = generateOpaqueToken();

    reply.setCookie(
      PREAUTH_CSRF_COOKIE,
      csrfToken,
      csrfCookieOptions(env, PREAUTH_CSRF_TTL_SECONDS),
    );
    noStore(reply);
    return { csrfToken };
  });

  app.post('/api/auth/login', async (request, reply) => {
    noStore(reply);

    const parsed = loginSchema.safeParse(request.body);
    if (!parsed.success) {
      return sendError(reply, request, 400, 'VALIDATION_ERROR', 'Invalid request');
    }

    if (!preAuthCsrfValid(request)) {
      return sendError(reply, request, 403, 'CSRF_INVALID', 'Invalid CSRF token');
    }

    try {
      const result = await auth.login({
        username: parsed.data.username,
        password: parsed.data.password,
        ip: request.ip,
        ...(parsed.data.remember === undefined ? {} : { remember: parsed.data.remember }),
      });

      // Follow the session's actual expiry so "Remember Me" can extend it.
      const maxAge = Math.max(60, Math.round((result.expiresAt.getTime() - Date.now()) / 1000));

      reply.setCookie(SESSION_COOKIE, result.sessionToken, sessionCookieOptions(env, maxAge));
      reply.setCookie(CSRF_COOKIE, result.csrfToken, csrfCookieOptions(env, maxAge));
      reply.clearCookie(PREAUTH_CSRF_COOKIE, clearCsrfCookieOptions(env));

      return {
        user: result.user,
        csrfToken: result.csrfToken,
        expiresAt: result.expiresAt.toISOString(),
      };
    } catch (error) {
      return handleAuthError(error, reply, request);
    }
  });

  app.get('/api/auth/session', async (request, reply) => {
    noStore(reply);
    const sessionToken = cookieValue(request, SESSION_COOKIE);

    if (!sessionToken) {
      return sendError(reply, request, 401, 'UNAUTHENTICATED', 'Not authenticated');
    }

    try {
      const session = await auth.validateSession(sessionToken);
      if (!session) {
        reply.clearCookie(SESSION_COOKIE, clearSessionCookieOptions(env));
        reply.clearCookie(CSRF_COOKIE, clearCsrfCookieOptions(env));
        return sendError(reply, request, 401, 'UNAUTHENTICATED', 'Not authenticated');
      }

      return {
        user: session.user,
        expiresAt: session.expiresAt.toISOString(),
      };
    } catch (error) {
      return handleAuthError(error, reply, request);
    }
  });

  app.post('/api/auth/logout', async (request, reply) => {
    noStore(reply);
    const sessionToken = cookieValue(request, SESSION_COOKIE);

    if (!sessionToken) {
      return sendError(reply, request, 401, 'UNAUTHENTICATED', 'Not authenticated');
    }

    try {
      const session = await auth.validateSession(sessionToken);
      if (!session) {
        reply.clearCookie(SESSION_COOKIE, clearSessionCookieOptions(env));
        reply.clearCookie(CSRF_COOKIE, clearCsrfCookieOptions(env));
        return sendError(reply, request, 401, 'UNAUTHENTICATED', 'Not authenticated');
      }

      const token = csrfHeader(request);
      if (!token || !verifyCsrfToken(token, session.csrfHash)) {
        return sendError(reply, request, 403, 'CSRF_INVALID', 'Invalid CSRF token');
      }

      await auth.logout(sessionToken);
      reply.clearCookie(SESSION_COOKIE, clearSessionCookieOptions(env));
      reply.clearCookie(CSRF_COOKIE, clearCsrfCookieOptions(env));
      return reply.code(204).send();
    } catch (error) {
      return handleAuthError(error, reply, request);
    }
  });
}
