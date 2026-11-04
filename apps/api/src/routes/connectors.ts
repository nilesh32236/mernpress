import type { AuthService, ConnectorService } from '@mernpress/cms-core';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { requireAdmin } from '../auth/require-admin.js';
import type { Env } from '../config/env.js';
import { sendRouteError } from './send-error.js';

const providerParamSchema = z.object({ id: z.string().min(1).max(64) }).strict();
const keySchema = z.object({ apiKey: z.string().min(1).max(4096) }).strict();

interface ConnectorRouteOptions {
  env: Env;
  auth: AuthService;
  connectors: ConnectorService;
}

/** Settings → Connectors. Administrator-only, like WordPress `manage_options`. */
export function registerConnectorRoutes(
  app: FastifyInstance,
  options: ConnectorRouteOptions,
): void {
  const { env, auth, connectors } = options;
  const guard = (request: FastifyRequest, reply: FastifyReply) =>
    requireAdmin(request, reply, { env, auth });

  app.get('/api/admin/connectors', async (request, reply) => {
    const ctx = await guard(request, reply);
    if (!ctx) return;
    try {
      return { items: await connectors.list(ctx.principal) };
    } catch (error) {
      return sendRouteError(reply, request, error);
    }
  });

  app.put('/api/admin/connectors/:id', async (request, reply) => {
    const ctx = await guard(request, reply);
    if (!ctx) return;
    try {
      const { id } = providerParamSchema.parse(request.params);
      const body = keySchema.parse(request.body);
      return { items: await connectors.setKey(ctx.principal, id, body.apiKey) };
    } catch (error) {
      return sendRouteError(reply, request, error);
    }
  });

  app.delete('/api/admin/connectors/:id', async (request, reply) => {
    const ctx = await guard(request, reply);
    if (!ctx) return;
    try {
      const { id } = providerParamSchema.parse(request.params);
      return { items: await connectors.disconnect(ctx.principal, id) };
    } catch (error) {
      return sendRouteError(reply, request, error);
    }
  });
}
