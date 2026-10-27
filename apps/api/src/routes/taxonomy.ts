import { ContentError, type TaxonomyService } from '@mernpress/cms-core';
import type { AuthService } from '@mernpress/cms-core';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { requireAdmin } from '../auth/require-admin.js';
import type { Env } from '../config/env.js';
import {
  createTermSchema,
  idParamSchema,
  termListQuerySchema,
  updateTermSchema,
} from './content-schemas.js';

interface TaxonomyRouteOptions {
  env: Env;
  auth: AuthService;
  taxonomy: TaxonomyService;
}

function validationMessage(issues: Array<{ path: PropertyKey[]; message: string }>): string {
  const first = issues[0];
  if (!first) {
    return 'Invalid request';
  }
  const path = first.path.map(String).join('.');
  return path ? `${path}: ${first.message}` : first.message;
}

export function registerTaxonomyRoutes(app: FastifyInstance, options: TaxonomyRouteOptions): void {
  const { env, auth, taxonomy } = options;

  async function handle(
    request: FastifyRequest,
    reply: FastifyReply,
    run: (principal: { userId: string; role: string }) => Promise<unknown>,
  ): Promise<FastifyReply> {
    const ctx = await requireAdmin(request, reply, { env, auth });
    if (!ctx) {
      return reply;
    }
    try {
      const result = await run(ctx.principal);
      return reply.send(result ?? { ok: true });
    } catch (error) {
      if (error instanceof ContentError) {
        return reply.code(error.statusCode).send({
          error: { code: error.code, message: error.message, requestId: request.id },
        });
      }
      throw error;
    }
  }

  app.get('/api/admin/terms', async (request, reply) =>
    handle(request, reply, async (principal) => {
      const parsed = termListQuerySchema.safeParse(request.query);
      if (!parsed.success) {
        throw new ContentError('VALIDATION_ERROR', validationMessage(parsed.error.issues), 400);
      }
      return taxonomy.listTerms(principal, parsed.data);
    }),
  );

  app.post('/api/admin/terms', async (request, reply) =>
    handle(request, reply, async (principal) => {
      const parsed = createTermSchema.safeParse(request.body);
      if (!parsed.success) {
        throw new ContentError('VALIDATION_ERROR', validationMessage(parsed.error.issues), 400);
      }
      const term = await taxonomy.createTerm(principal, parsed.data);
      reply.code(201);
      return term;
    }),
  );

  app.get('/api/admin/terms/:id', async (request, reply) =>
    handle(request, reply, async (principal) => {
      const params = idParamSchema.safeParse(request.params);
      if (!params.success) {
        throw new ContentError('VALIDATION_ERROR', 'Invalid id', 400);
      }
      return taxonomy.getTerm(principal, params.data.id);
    }),
  );

  app.patch('/api/admin/terms/:id', async (request, reply) =>
    handle(request, reply, async (principal) => {
      const params = idParamSchema.safeParse(request.params);
      if (!params.success) {
        throw new ContentError('VALIDATION_ERROR', 'Invalid id', 400);
      }
      const parsed = updateTermSchema.safeParse(request.body);
      if (!parsed.success) {
        throw new ContentError('VALIDATION_ERROR', validationMessage(parsed.error.issues), 400);
      }
      return taxonomy.updateTerm(principal, params.data.id, parsed.data);
    }),
  );

  app.delete('/api/admin/terms/:id', async (request, reply) =>
    handle(request, reply, async (principal) => {
      const params = idParamSchema.safeParse(request.params);
      if (!params.success) {
        throw new ContentError('VALIDATION_ERROR', 'Invalid id', 400);
      }
      const result = await taxonomy.deleteTerm(principal, params.data.id);
      return result;
    }),
  );
}
