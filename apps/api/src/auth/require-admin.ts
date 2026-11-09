import { verifyCsrfToken, type AuthService } from '@mernpress/cms-core';
import type { FastifyReply, FastifyRequest } from 'fastify';
import {
  clearCsrfCookieOptions,
  clearSessionCookieOptions,
  CSRF_COOKIE,
  SESSION_COOKIE,
} from '../auth/cookies.js';
import type { Env } from '../config/env.js';
import { createMemoryRateLimit } from '../security/memory-rate-limit.js';

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * Failed application-password verifications are charged per IP. Each verify
 * runs up to ten Argon2id hashes (64 MiB each), so an unthrottled Basic path is
 * a CPU/memory amplification primitive for an unauthenticated caller. Ten
 * failures a minute stops guessing without affecting legitimate clients.
 */
const basicFailureLimiter = createMemoryRateLimit({ max: 10, windowMs: 60 * 1000 });

interface BasicCredentials {
  username: string;
  password: string;
}

/** Parse `Authorization: Basic base64(username:password)`; the password may contain ':'. */
function parseBasicAuthorization(header: string | undefined): BasicCredentials | null {
  if (typeof header !== 'string') return null;
  const match = /^Basic\s+([A-Za-z0-9+/=]+)$/i.exec(header.trim());
  if (!match) return null;
  let decoded: string;
  try {
    decoded = Buffer.from(match[1]!, 'base64').toString('utf8');
  } catch {
    return null;
  }
  const separator = decoded.indexOf(':');
  if (separator <= 0) return null;
  const username = decoded.slice(0, separator).trim();
  const password = decoded.slice(separator + 1);
  if (!username || !password) return null;
  return { username, password };
}

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
  let session = null;
  if (typeof sessionToken === 'string' && sessionToken.length > 0) {
    try {
      session = await auth.validateSession(sessionToken);
    } catch {
      session = null;
    }
  }

  if (!session) {
    // WordPress application passwords authenticate API requests with HTTP
    // Basic auth instead of a browser session; they carry no CSRF token, so
    // the CSRF check below is skipped for this path.
    const basic = parseBasicAuthorization(request.headers.authorization);
    if (basic) {
      if (env.NODE_ENV === 'production' && request.protocol !== 'https') {
        sendError(
          reply,
          request,
          401,
          'APP_PASSWORD_HTTPS_REQUIRED',
          'Application passwords require HTTPS.',
        );
        return null;
      }
      let principal;
      try {
        principal = await request.server.appPasswords.verify(
          basic.username,
          basic.password,
          request.ip,
        );
      } catch {
        principal = null;
      }
      if (!principal) {
        const decision = basicFailureLimiter(`${request.ip}:app-password`);
        if (!decision.allowed) {
          reply.header('retry-after', String(decision.retryAfterSeconds));
          sendError(
            reply,
            request,
            429,
            'RATE_LIMITED',
            'Too many failed application-password attempts.',
          );
          return null;
        }
        sendError(reply, request, 401, 'UNAUTHENTICATED', 'Not authenticated');
        return null;
      }
      return { principal };
    }

    if (typeof sessionToken === 'string' && sessionToken.length > 0) {
      reply.clearCookie(SESSION_COOKIE, clearSessionCookieOptions(env));
      reply.clearCookie(CSRF_COOKIE, clearCsrfCookieOptions(env));
    }
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
