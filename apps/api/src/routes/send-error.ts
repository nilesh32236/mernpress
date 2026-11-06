import type { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';

/**
 * Shared error envelope for the user-administration and profile routes.
 *
 * Zod failures become 400 VALIDATION_ERROR with per-issue details. Domain errors
 * (`UserAdminError`, `ContentError` from the capability guard, `AuthError`) are
 * mapped from their `statusCode` + `code`; anything else is a 500 with a generic
 * message so internals never leak.
 */
export function sendRouteError(
  reply: FastifyReply,
  request: FastifyRequest,
  error: unknown,
): FastifyReply {
  if (error instanceof z.ZodError) {
    return reply.code(400).send({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid request',
        requestId: request.id,
        details: error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        })),
      },
    });
  }

  const domainError = error as { code?: string; statusCode?: number; message?: string };
  const statusCode =
    typeof domainError.statusCode === 'number' && domainError.statusCode >= 400
      ? domainError.statusCode
      : 500;
  const code = typeof domainError.code === 'string' ? domainError.code : 'INTERNAL_ERROR';
  const message =
    statusCode >= 500 ? 'Internal server error' : (domainError.message ?? 'Request rejected');

  const details = (error as { details?: unknown }).details;
  return reply.code(statusCode).send({
    error: {
      code,
      message,
      requestId: request.id,
      // Client-safe context (e.g. a stable reason code for localization).
      // Never echo details for server failures.
      ...(statusCode < 500 && details !== undefined ? { details } : {}),
    },
  });
}
