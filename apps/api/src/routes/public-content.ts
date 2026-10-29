import { ContentError, type ContentService } from '@mernpress/cms-core';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import {
  publicListQuerySchema,
  publicSlugQuerySchema,
  slugParamSchema,
} from './content-schemas.js';

const previewTokenParamSchema = z.object({ token: z.string().min(1).max(200) }).strict();

interface PublicRouteOptions {
  content: ContentService;
}

function validationMessage(issues: Array<{ path: PropertyKey[]; message: string }>): string {
  const first = issues[0];
  if (!first) {
    return 'Invalid request';
  }
  const path = first.path.map(String).join('.');
  return path ? `${path}: ${first.message}` : first.message;
}

export function registerPublicContentRoutes(
  app: FastifyInstance,
  options: PublicRouteOptions,
): void {
  const { content } = options;

  async function handle(
    request: FastifyRequest,
    reply: FastifyReply,
    run: () => Promise<unknown>,
  ): Promise<FastifyReply> {
    try {
      const result = await run();
      return reply.send(result);
    } catch (error) {
      if (error instanceof ContentError) {
        return reply.code(error.statusCode).send({
          error: { code: error.code, message: error.message, requestId: request.id },
        });
      }
      throw error;
    }
  }

  app.get('/api/public/posts', async (request, reply) =>
    handle(request, reply, async () => {
      const parsed = publicListQuerySchema.safeParse(request.query);
      if (!parsed.success) {
        throw new ContentError('VALIDATION_ERROR', validationMessage(parsed.error.issues), 400);
      }
      return content.listPublic(parsed.data);
    }),
  );

  app.get('/api/public/posts/:slug', async (request, reply) =>
    handle(request, reply, async () => {
      const params = slugParamSchema.safeParse(request.params);
      if (!params.success) {
        throw new ContentError('VALIDATION_ERROR', 'Invalid slug', 400);
      }
      const query = publicSlugQuerySchema.safeParse(request.query);
      if (!query.success) {
        throw new ContentError('VALIDATION_ERROR', validationMessage(query.error.issues), 400);
      }
      return content.getPublicBySlug(query.data.type, params.data.slug);
    }),
  );

  // Draft/preview sharing (P8-03): token-gated, never cached, never indexed,
  // and the token is not echoed in the response body.
  app.get('/api/public/preview/:token', async (request, reply) => {
    reply.header('Cache-Control', 'no-store');
    reply.header('X-Robots-Tag', 'noindex, nofollow');
    return handle(request, reply, async () => {
      const params = previewTokenParamSchema.safeParse(request.params);
      if (!params.success) {
        throw new ContentError('VALIDATION_ERROR', 'Invalid preview token', 400);
      }
      return content.getPreviewPost(params.data.token);
    });
  });
}
