import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import {
  AuthError,
  ContentError,
  createAuthService,
  createContentService,
  createHookRegistry,
  createTaxonomyService,
  createUserAdminService,
  createOptionService,
  createScheduleService,
  createBulkService,
  createMediaService,
  createAutosaveService,
  createCommentService,
  createThemeService,
  createPluginService,
  createUpdateService,
  createDashboardFeedService,
  createPrivacyService,
  createImportService,
  createConnectorService,
  createApplicationPasswordService,
  type AuthConfig,
} from '@mernpress/cms-core';
import { checkDatabase, createDatabaseClient } from '@mernpress/database';
import Fastify, { type FastifyInstance } from 'fastify';
import { SESSION_COOKIE } from './auth/cookies.js';
import { loadEnv, type Env } from './config/env.js';
import { registerAuthRoutes } from './routes/auth.js';
import { registerContentRoutes } from './routes/content.js';
import { registerPublicContentRoutes } from './routes/public-content.js';
import { registerTaxonomyRoutes } from './routes/taxonomy.js';
import { registerUserRoutes } from './routes/users.js';
import { registerProfileRoutes } from './routes/profile.js';
import { registerOptionRoutes } from './routes/options.js';
import { registerScheduleRoutes } from './routes/schedule.js';
import { registerContentBulkRoutes } from './routes/content-bulk.js';
import { registerMediaRoutes } from './routes/media.js';
import { registerAutosaveRoutes } from './routes/autosave.js';
import { registerCommentRoutes, registerPublicCommentRoutes } from './routes/comments.js';
import { registerThemeRoutes } from './routes/themes.js';
import { registerPluginRoutes } from './routes/plugins.js';
import { registerUpdateRoutes } from './routes/updates.js';
import { registerDashboardRoutes } from './routes/dashboard.js';
import { registerImportRoutes } from './routes/import.js';
import { registerPrivacyRoutes } from './routes/privacy.js';
import { registerConnectorRoutes } from './routes/connectors.js';
import { registerAdminHealthRoutes } from './routes/admin-health.js';
import { startPublishScheduler } from './scheduler.js';
import { resolveRequestId } from './http/request-id.js';
import { mkdirSync } from 'node:fs';

export interface BuildAppOptions {
  env?: Env;
  logger?: boolean;
  loggerStream?: { write(message: string): void };
  now?: () => Date;
}

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export async function buildApp(options: BuildAppOptions = {}): Promise<FastifyInstance> {
  const env = options.env ?? loadEnv();

  const app = Fastify({
    trustProxy: env.TRUST_PROXY,
    bodyLimit: 16 * 1024,
    logger:
      options.logger === false
        ? false
        : {
            level: env.LOG_LEVEL,
            ...(options.loggerStream === undefined ? {} : { stream: options.loggerStream }),
            redact: {
              paths: [
                'req.headers.authorization',
                'req.headers.cookie',
                'res.headers["set-cookie"]',
                'req.body.password',
                'req.body.csrfToken',
              ],
              censor: '[redacted]',
            },
          },
    genReqId: (request) => resolveRequestId(request.headers['x-request-id']),
    requestIdHeader: false,
  });

  await app.register(helmet, {
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  });

  await app.register(cors, {
    origin: env.CORS_ORIGINS,
    credentials: true,
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['content-type', 'x-csrf-token', 'x-request-id'],
    exposedHeaders: ['x-request-id'],
  });

  await app.register(cookie);

  const database = createDatabaseClient({ connectionString: env.DATABASE_URL });
  app.decorate('database', database);

  const authConfig: AuthConfig = {
    hashPepper: env.AUTH_HASH_PEPPER,
    sessionTtlMinutes: env.SESSION_TTL_MINUTES,
    sessionIdleMinutes: env.SESSION_IDLE_MINUTES,
    loginRateLimitMax: env.LOGIN_RATE_LIMIT_MAX,
    loginRateLimitWindowMinutes: env.LOGIN_RATE_LIMIT_WINDOW_MINUTES,
    ...(options.now === undefined ? {} : { now: options.now }),
  };
  const auth = createAuthService({ prisma: database, config: authConfig });
  app.decorate('auth', auth);

  // Phase 3: internal hook registry + content/taxonomy services (ADR 0003).
  // The registry is per-app-instance, not a global singleton, so tests and
  // multiple instances stay isolated.
  const contentHooks = createHookRegistry({
    logger: { warn: (message) => app.log.warn(message) },
  });
  app.decorate('contentHooks', contentHooks);

  const content = createContentService({
    prisma: database,
    hooks: contentHooks,
    logger: {
      warn: (message, meta) => app.log.warn({ ...meta }, message),
    },
  });
  app.decorate('content', content);

  const taxonomy = createTaxonomyService({ prisma: database, hooks: contentHooks });
  app.decorate('taxonomy', taxonomy);

  const users = createUserAdminService({ prisma: database });
  app.decorate('users', users);

  const appPasswords = createApplicationPasswordService({ prisma: database });
  app.decorate('appPasswords', appPasswords);

  const optionService = createOptionService({ prisma: database });

  const schedule = createScheduleService({
    prisma: database,
    hooks: contentHooks,
    ...(options.now === undefined ? {} : { now: options.now }),
  });
  app.decorate('schedule', schedule);

  const bulk = createBulkService({ prisma: database, content });
  app.decorate('bulk', bulk);

  const media = createMediaService({
    prisma: database,
    storageRoot: env.MEDIA_STORAGE_DIR,
    logger: {
      warn: (message, meta) => app.log.warn({ ...meta }, message),
    },
    ...(options.now === undefined ? {} : { now: options.now }),
  });
  app.decorate('media', media);
  mkdirSync(env.MEDIA_STORAGE_DIR, { recursive: true });

  const autosave = createAutosaveService({ prisma: database });
  app.decorate('autosave', autosave);

  const comments = createCommentService({ prisma: database });
  app.decorate('comments', comments);

  const themes = createThemeService({ prisma: database });
  app.decorate('themes', themes);

  const plugins = createPluginService({ prisma: database });
  app.decorate('plugins', plugins);

  const updates = createUpdateService({ prisma: database, manifestUrl: env.UPDATE_MANIFEST_URL });
  app.decorate('updates', updates);

  const dashboardFeeds = createDashboardFeedService({
    prisma: database,
    eventsUrl: env.EVENTS_API_URL ?? undefined,
    newsUrl: env.NEWS_FEED_URL ?? undefined,
  });
  app.decorate('dashboardFeeds', dashboardFeeds);

  const imports = createImportService({ prisma: database });
  const privacy = createPrivacyService({ prisma: database });
  app.decorate('imports', imports);
  app.decorate('privacy', privacy);

  const connectors = createConnectorService({ prisma: database, pepper: env.AUTH_HASH_PEPPER });
  app.decorate('connectors', connectors);

  app.addHook('onRequest', async (request, reply) => {
    if (!MUTATING_METHODS.has(request.method)) {
      return;
    }

    // Application-password clients authenticate with explicit Basic
    // credentials and send no cookies, so browser CSRF does not apply and
    // WordPress-compatible API clients (which have no Origin) must be allowed.
    const hasSessionCookie = typeof request.cookies?.[SESSION_COOKIE] === 'string';
    const authorization = request.headers.authorization;
    if (
      !hasSessionCookie &&
      typeof authorization === 'string' &&
      /^Basic\s+/i.test(authorization)
    ) {
      return;
    }

    const origin = request.headers.origin;
    if (typeof origin !== 'string' || !env.CORS_ORIGINS.includes(origin)) {
      request.log.warn('origin rejected');
      return reply.code(403).send({
        error: {
          code: 'ORIGIN_NOT_ALLOWED',
          message: 'Origin not allowed',
          requestId: request.id,
        },
      });
    }
  });

  app.addHook('onSend', async (request, reply) => {
    reply.header('x-request-id', request.id);
  });

  app.addHook('onClose', async () => {
    await database.$disconnect();
  });

  registerAuthRoutes(app, { env, auth });
  registerContentRoutes(app, { env, auth, content });
  registerTaxonomyRoutes(app, { env, auth, taxonomy });
  registerUserRoutes(app, { env, auth, users });
  registerProfileRoutes(app, { env, auth, users, appPasswords });
  registerOptionRoutes(app, { env, auth, options: optionService });
  registerScheduleRoutes(app, { env, auth, schedule });
  registerContentBulkRoutes(app, { env, auth, bulk });
  registerMediaRoutes(app, { env, auth, media, storageRoot: env.MEDIA_STORAGE_DIR });
  registerAutosaveRoutes(app, { env, auth, autosave });
  registerAdminHealthRoutes(app, { env, auth, database });
  registerPublicContentRoutes(app, { content, options: optionService });
  registerCommentRoutes(app, { env, auth, comments });
  registerThemeRoutes(app, { env, auth, themes });
  registerPluginRoutes(app, { env, auth, plugins });
  registerUpdateRoutes(app, { env, auth, updates });
  registerDashboardRoutes(app, { env, auth, dashboardFeeds });
  registerImportRoutes(app, { env, auth, imports });
  registerPrivacyRoutes(app, { env, auth, privacy });
  registerConnectorRoutes(app, { env, auth, connectors });
  registerPublicCommentRoutes(app, { comments, auth });

  if (env.SCHEDULER_ENABLED) {
    startPublishScheduler(app, { schedule });
  }

  app.get('/api/health', async () => ({
    status: 'ok',
    service: 'mernpress-api',
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.floor(process.uptime()),
  }));

  app.get('/api/ready', async (request, reply) => {
    try {
      await checkDatabase(database);
      return { status: 'ready', checks: { database: 'ok' } };
    } catch {
      request.log.warn('readiness check failed');
      return reply.code(503).send({
        status: 'not_ready',
        checks: { database: 'unavailable' },
      });
    }
  });

  app.setNotFoundHandler((request, reply) =>
    reply.code(404).send({
      error: {
        code: 'NOT_FOUND',
        message: 'Route not found',
        requestId: request.id,
      },
    }),
  );

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof ContentError) {
      return reply.code(error.statusCode).send({
        error: {
          code: error.code,
          message: error.message,
          requestId: request.id,
        },
      });
    }

    if (error instanceof AuthError) {
      if (error.retryAfterSeconds !== undefined) {
        reply.header('retry-after', String(error.retryAfterSeconds));
      }
      return reply.code(error.statusCode).send({
        error: {
          code: error.code,
          message: error.message,
          requestId: request.id,
        },
      });
    }

    const statusCode = getErrorStatusCode(error);

    if (statusCode >= 500) {
      request.log.error({ err: error }, 'request failed');
    } else {
      request.log.warn({ err: error }, 'request rejected');
    }

    const message =
      env.NODE_ENV !== 'production'
        ? getErrorMessage(error)
        : statusCode >= 500
          ? 'Internal server error'
          : 'Request rejected';
    const code =
      statusCode === 413
        ? 'PAYLOAD_TOO_LARGE'
        : statusCode >= 500
          ? 'INTERNAL_ERROR'
          : 'REQUEST_ERROR';

    return reply.code(statusCode).send({
      error: {
        code,
        message,
        requestId: request.id,
      },
    });
  });

  return app;
}

function getErrorStatusCode(error: unknown): number {
  if (typeof error === 'object' && error !== null && 'statusCode' in error) {
    const { statusCode } = error;
    if (typeof statusCode === 'number' && statusCode >= 400) {
      return statusCode;
    }
  }
  return 500;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Request failed';
}
