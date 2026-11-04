import type { AuthService, ThemeService } from '@mernpress/cms-core';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { requireAdmin } from '../auth/require-admin.js';
import type { Env } from '../config/env.js';
import { sendRouteError } from './send-error.js';

const themeParamSchema = z.object({ id: z.string().min(1).max(100) }).strict();
const autoUpdatesSchema = z.object({ enabled: z.boolean() }).strict();

interface ThemeRouteOptions {
  env: Env;
  auth: AuthService;
  themes: ThemeService;
}

/**
 * Appearance → Themes. WordPress gates theme management on
 * `switch_themes`/`manage_options`; MERNPress serves the same data to
 * administrators only.
 */
export function registerThemeRoutes(app: FastifyInstance, options: ThemeRouteOptions): void {
  const { env, auth, themes } = options;
  const guard = (request: FastifyRequest, reply: FastifyReply) =>
    requireAdmin(request, reply, { env, auth });

  app.get('/api/admin/themes', async (request, reply) => {
    const ctx = await guard(request, reply);
    if (!ctx) return;
    try {
      return await themes.list(ctx.principal);
    } catch (error) {
      return sendRouteError(reply, request, error);
    }
  });

  app.post('/api/admin/themes/auto-updates', async (request, reply) => {
    const ctx = await guard(request, reply);
    if (!ctx) return;
    try {
      const body = autoUpdatesSchema.parse(request.body);
      return await themes.setAutoUpdates(ctx.principal, body.enabled);
    } catch (error) {
      return sendRouteError(reply, request, error);
    }
  });

  app.post('/api/admin/themes/:id/activate', async (request, reply) => {
    const ctx = await guard(request, reply);
    if (!ctx) return;
    try {
      const { id } = themeParamSchema.parse(request.params);
      return await themes.activate(ctx.principal, id);
    } catch (error) {
      return sendRouteError(reply, request, error);
    }
  });
}
