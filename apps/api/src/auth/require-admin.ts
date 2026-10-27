import { verifyCsrfToken, type AuthService } from '@mernpress/cms-core';
import type { FastifyReply, FastifyRequest } from 'fastify';
import {
  clearCsrfCookieOptions,
  clearSessionCookieOptions,
  CSRF_COOKIE,
  SESSION_COOKIE,
} from '../auth/cookies.js';
import type { Env } from '../config/env.js';

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export interface AdminContext {
  principal: { userId: string; role: string };
}

function sendError(
  reply: FastifyReply,
  request: FastifyRequest,
  statusCode: number,
  code: string,
  message: string,
): FastifyReply {
  return reply.code(statusCode).send({ error: { code, message, requestId: request.id } });
}

/**
 * Authenticate an admin-area request: valid active session + (for mutations)
 * session-bound CSRF. Returns the principal `{ userId, role }` for the domain
 * service to authorize, or sends an error and returns null. This layer does NOT
 * decide permission — object-level capability checks live in the service
 * (ADR 0004). Fail closed: missing/invalid/disabled session is denied here.
 */
export async function requireAdmin(
  request: FastifyRequest,
  reply: FastifyReply,
  options: { env: Env; auth: AuthService },
): Promise<AdminContext | null> {
  const { env, auth } = options;

  const sessionToken = request.cookies[SESSION_COOKIE];
  if (typeof sessionToken !== 'string' || sessionToken.length === 0) {
    sendError(reply, request, 401, 'UNAUTHENTICATED', 'Not authenticated');
    return null;
  }

  let session;
  try {
    session = await auth.validateSession(sessionToken);
  } catch {
    sendError(reply, request, 401, 'UNAUTHENTICATED', 'Not authenticated');
    return null;
  }

  if (!session) {
    reply.clearCookie(SESSION_COOKIE, clearSessionCookieOptions(env));
    reply.clearCookie(CSRF_COOKIE, clearCsrfCookieOptions(env));
    sendError(reply, request, 401, 'UNAUTHENTICATED', 'Not authenticated');
    return null;
  }

  if (MUTATING.has(request.method)) {
    const token = request.headers['x-csrf-token'];
    const valid =
      typeof token === 'string' && token.length > 0 && verifyCsrfToken(token, session.csrfHash);
    if (!valid) {
      sendError(reply, request, 403, 'CSRF_INVALID', 'Invalid CSRF token');
      return null;
    }
  }

  return { principal: { userId: session.user.id, role: session.user.role } };
}
