import type { AuthService, DashboardFeedService } from '@mernpress/cms-core';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { requireAdmin } from '../auth/require-admin.js';
import type { Env } from '../config/env.js';
import { sendRouteError } from './send-error.js';

const feedsQuerySchema = z.object({ location: z.string().max(120).optional() }).strict();

interface DashboardRouteOptions {
  env: Env;
  auth: AuthService;
  dashboardFeeds: DashboardFeedService;
}

/** Dashboard → Events and News widget data. Visible to every signed-in admin user. */
export function registerDashboardRoutes(
  app: FastifyInstance,
  options: DashboardRouteOptions,
): void {
  const { env, auth, dashboardFeeds } = options;
  const guard = (request: FastifyRequest, reply: FastifyReply) =>
    requireAdmin(request, reply, { env, auth });

  app.get('/api/admin/dashboard/feeds', async (request, reply) => {
    const ctx = await guard(request, reply);
    if (!ctx) return;
    try {
      const query = feedsQuerySchema.parse(request.query);
      return await dashboardFeeds.load(query.location ?? '');
    } catch (error) {
      return sendRouteError(reply, request, error);
    }
  });
}
