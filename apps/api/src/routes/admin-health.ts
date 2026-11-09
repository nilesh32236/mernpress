import { accessSync, constants } from 'node:fs';
import { requireCapability, type AuthService } from '@mernpress/cms-core';
import { checkDatabase, type DatabaseClient } from '@mernpress/database';
import type { FastifyInstance } from 'fastify';
import { requireAdmin } from '../auth/require-admin.js';
import type { Env } from '../config/env.js';

/**
 * Minimal admin site-health checks (dashboard card). Read-only, administrator
 * session required; no secrets or configuration values are exposed.
 */
export function registerAdminHealthRoutes(
  app: FastifyInstance,
  options: { env: Env; auth: AuthService; database: DatabaseClient },
): void {
  const { env, auth, database } = options;

  app.get('/api/admin/health', async (request, reply) => {
    const ctx = await requireAdmin(request, reply, { env, auth });
    if (!ctx) return;
    // Site Health is an administrator surface (WordPress gates it on
    // view_site_health_checks); it exposes environment and filesystem state.
    requireCapability(ctx.principal, 'manage_options');

    let databaseStatus: 'ok' | 'error' = 'ok';
    try {
      await checkDatabase(database);
    } catch {
      databaseStatus = 'error';
    }

    const mediaWritable = (() => {
      try {
        accessSync(env.MEDIA_STORAGE_DIR, constants.W_OK);
        return true;
      } catch {
        return false;
      }
    })();

    return {
      database: databaseStatus,
      mediaWritable,
      schedulerEnabled: env.SCHEDULER_ENABLED,
      nodeEnv: env.NODE_ENV,
    };
  });
}
