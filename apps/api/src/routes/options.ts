import { ContentError, type AuthService, type OptionService } from '@mernpress/cms-core';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { requireAdmin } from '../auth/require-admin.js';
import type { Env } from '../config/env.js';

interface OptionRouteOptions {
  env: Env;
  auth: AuthService;
  options: OptionService;
}

const groupEnum = z.enum(['general', 'reading', 'writing']);

const getQuerySchema = z.object({ group: groupEnum }).strict();

const putBodySchema = z
  .object({
    group: groupEnum,
    values: z.record(z.string(), z.unknown()),
  })
  .strict();

function validationMessage(issues: Array<{ path: PropertyKey[]; message: string }>): string {
  const first = issues[0];
  if (!first) {
    return 'Invalid request';
  }
  const path = first.path.map(String).join('.');
  return path ? `${path}: ${first.message}` : first.message;
}

export function registerOptionRoutes(app: FastifyInstance, options: OptionRouteOptions): void {
  const { env, auth, options: optionService } = options;

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

  app.get('/api/options', async (request, reply) =>
    handle(request, reply, async (principal) => {
      const parsed = getQuerySchema.safeParse(request.query);
      if (!parsed.success) {
        throw new ContentError('VALIDATION_ERROR', validationMessage(parsed.error.issues), 400);
      }
      return optionService.getOptions(principal, { group: parsed.data.group });
    }),
  );

  app.put('/api/options', async (request, reply) =>
    handle(request, reply, async (principal) => {
      const parsed = putBodySchema.safeParse(request.body);
      if (!parsed.success) {
        throw new ContentError('VALIDATION_ERROR', validationMessage(parsed.error.issues), 400);
      }
      return optionService.updateOptions(principal, parsed.data);
    }),
  );
}
