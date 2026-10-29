import { createMediaService } from '@mernpress/cms-core';
import type { FastifyInstance } from 'fastify';
import { rm } from 'node:fs/promises';
import { buildApp } from '../../src/app.js';
import { registerMediaRoutes } from '../../src/routes/media.js';
import { resetAuthTables } from '../helpers/auth.js';
import { makeTestEnv } from '../helpers/env.js';

export interface MediaTestApp {
  app: FastifyInstance;
  /** Absolute root of this app's isolated uploads directory. */
  storageRoot: string;
}

/**
 * Builds the API with the media routes mounted and an isolated storage root.
 *
 * The routes are mounted here (rather than relying on `app.ts`) so this suite
 * exercises the module directly. `hasRoute` keeps it idempotent: once the
 * composition root also registers media routes, this helper reuses them and
 * simply points the app at the per-test storage directory.
 */
export async function createMediaTestApp(): Promise<MediaTestApp> {
  const env = makeTestEnv();
  const storageRoot = env.MEDIA_STORAGE_DIR;
  const app = await buildApp({ env, logger: false });

  if (!app.hasRoute({ method: 'POST', url: '/api/admin/media' })) {
    registerMediaRoutes(app, {
      env,
      auth: app.auth,
      media: createMediaService({ prisma: app.database, storageRoot }),
      storageRoot,
    });
  }

  await app.ready();
  await resetAuthTables(app);
  return { app, storageRoot };
}

export async function closeMediaTestApp(context: MediaTestApp): Promise<void> {
  await context.app.close();
  await rm(context.storageRoot, { recursive: true, force: true });
}
