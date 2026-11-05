import type { AuthService, MailService } from '@mernpress/cms-core';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { requireAdmin } from '../auth/require-admin.js';
import type { Env } from '../config/env.js';
import { sendRouteError } from './send-error.js';

interface MailRouteOptions {
  env: Env;
  auth: AuthService;
  mail: MailService;
}

/** Mail capability for the Add User screen and settings help. Administrators only. */
export function registerMailRoutes(app: FastifyInstance, options: MailRouteOptions): void {
  const { env, auth, mail } = options;
  const guard = (request: FastifyRequest, reply: FastifyReply) =>
    requireAdmin(request, reply, { env, auth });

  app.get('/api/admin/mail/log', async (request, reply) => {
    const ctx = await guard(request, reply);
    if (!ctx) return;
    try {
      return { items: await mail.log(100) };
    } catch (error) {
      return sendRouteError(reply, request, error);
    }
  });

  app.delete('/api/admin/mail/log', async (request, reply) => {
    const ctx = await guard(request, reply);
    if (!ctx) return;
    try {
      await mail.clearLog();
      return reply.code(204).send();
    } catch (error) {
      return sendRouteError(reply, request, error);
    }
  });

  app.get('/api/admin/mail/status', async (request, reply) => {
    const ctx = await guard(request, reply);
    if (!ctx) return;
    try {
      return mail.status();
    } catch (error) {
      return sendRouteError(reply, request, error);
    }
  });
}
