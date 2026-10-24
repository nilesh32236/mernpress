import { randomUUID } from 'node:crypto';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import { checkDatabase, createDatabaseClient } from '@mernpress/database';
import Fastify, { type FastifyInstance } from 'fastify';
import { loadEnv, type Env } from './config/env.js';

export interface BuildAppOptions {
  env?: Env;
  logger?: boolean;
}

export async function buildApp(options: BuildAppOptions = {}): Promise<FastifyInstance> {
  const env = options.env ?? loadEnv();

  const app = Fastify({
    logger:
      options.logger === false
        ? false
        : {
            level: env.LOG_LEVEL,
            redact: {
              paths: [
                'req.headers.authorization',
                'req.headers.cookie',
                'res.headers["set-cookie"]',
              ],
              censor: '[redacted]',
            },
          },
    genReqId: (request) => {
      const header = request.headers['x-request-id'];
      return typeof header === 'string' && header.length > 0 ? header : randomUUID();
    },
    requestIdHeader: 'x-request-id',
  });

  await app.register(helmet, {
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  });

  await app.register(cors, {
    origin: env.CORS_ORIGINS,
    credentials: true,
    methods: ['GET', 'HEAD', 'OPTIONS'],
  });

  const database = createDatabaseClient({ connectionString: env.DATABASE_URL });
  app.decorate('database', database);

  app.addHook('onSend', async (request, reply) => {
    reply.header('x-request-id', request.id);
  });

  app.addHook('onClose', async () => {
    await database.$disconnect();
  });

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
    const statusCode = getErrorStatusCode(error);

    if (statusCode >= 500) {
      request.log.error({ err: error }, 'request failed');
    } else {
      request.log.warn({ err: error }, 'request rejected');
    }

    const exposeMessage = statusCode < 500 || env.NODE_ENV !== 'production';

    return reply.code(statusCode).send({
      error: {
        code: statusCode >= 500 ? 'INTERNAL_ERROR' : 'REQUEST_ERROR',
        message: exposeMessage ? getErrorMessage(error) : 'Internal server error',
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
