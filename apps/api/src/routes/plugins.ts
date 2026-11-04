import type { AuthService, PluginService } from '@mernpress/cms-core';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { requireAdmin } from '../auth/require-admin.js';
import type { Env } from '../config/env.js';
import { sendRouteError } from './send-error.js';

const pluginParamSchema = z.object({ id: z.string().min(1).max(100) }).strict();
const autoUpdatesSchema = z.object({ enabled: z.boolean() }).strict();

interface PluginRouteOptions {
  env: Env;
  auth: AuthService;
  plugins: PluginService;
}

/** Appearance/Plugins administration. WordPress gates this on `activate_plugins`. */
export function registerPluginRoutes(app: FastifyInstance, options: PluginRouteOptions): void {
  const { env, auth, plugins } = options;
  const guard = (request: FastifyRequest, reply: FastifyReply) =>
    requireAdmin(request, reply, { env, auth });

  app.get('/api/admin/plugins', async (request, reply) => {
    const ctx = await guard(request, reply);
    if (!ctx) return;
    try {
      return await plugins.list(ctx.principal);
    } catch (error) {
      return sendRouteError(reply, request, error);
    }
  });

  app.get('/api/admin/plugins/toolbar', async (request, reply) => {
    const ctx = await guard(request, reply);
    if (!ctx) return;
    try {
      return await plugins.toolbar(ctx.principal);
    } catch (error) {
      return sendRouteError(reply, request, error);
    }
  });

  app.post('/api/admin/plugins/auto-updates', async (request, reply) => {
    const ctx = await guard(request, reply);
    if (!ctx) return;
    try {
      const body = autoUpdatesSchema.parse(request.body);
      return await plugins.setAutoUpdates(ctx.principal, body.enabled);
    } catch (error) {
      return sendRouteError(reply, request, error);
    }
  });

  app.post('/api/admin/plugins/:id/activate', async (request, reply) => {
    const ctx = await guard(request, reply);
    if (!ctx) return;
    try {
      const { id } = pluginParamSchema.parse(request.params);
      return await plugins.activate(ctx.principal, id);
    } catch (error) {
      return sendRouteError(reply, request, error);
    }
  });

  app.post('/api/admin/plugins/:id/deactivate', async (request, reply) => {
    const ctx = await guard(request, reply);
    if (!ctx) return;
    try {
      const { id } = pluginParamSchema.parse(request.params);
      return await plugins.deactivate(ctx.principal, id);
    } catch (error) {
      return sendRouteError(reply, request, error);
    }
  });
}
