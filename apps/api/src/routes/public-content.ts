import { ContentError, type ContentService, type OptionService } from '@mernpress/cms-core';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import {
  publicListQuerySchema,
  publicSlugQuerySchema,
  slugParamSchema,
} from './content-schemas.js';

const previewTokenParamSchema = z.object({ token: z.string().min(1).max(200) }).strict();
const termParamSchema = z
  .object({ taxonomy: z.enum(['category', 'tag']), slug: z.string().min(1).max(200) })
  .strict();

interface PublicRouteOptions {
  content: ContentService;
  options: OptionService;
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
  const { content, options: optionService } = options;

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

  // Public-safe site settings (site title, tagline, search visibility, feed
  // preferences). No credentials are exposed.
  app.get('/api/public/site', async (request, reply) =>
    handle(request, reply, async () => optionService.getPublicSettings()),
  );

  app.get('/api/public/posts', async (request, reply) =>
    handle(request, reply, async () => {
      const parsed = publicListQuerySchema.safeParse(request.query);
      if (!parsed.success) {
        throw new ContentError('VALIDATION_ERROR', validationMessage(parsed.error.issues), 400);
      }
      return content.listPublic(parsed.data);
    }),
  );

  // Public taxonomy metadata for archive titles and descriptions. An existing
  // but empty category still has an archive in WordPress, so this stays a 200
  // even when the term has no published posts.
  app.get('/api/public/terms/:taxonomy/:slug', async (request, reply) =>
    handle(request, reply, async () => {
      const params = termParamSchema.safeParse(request.params);
      if (!params.success) {
        throw new ContentError('VALIDATION_ERROR', 'Invalid taxonomy term', 400);
      }
      const term = await content.getPublicTerm(params.data.taxonomy, params.data.slug);
      if (!term) {
        throw new ContentError('NOT_FOUND', 'Not found', 404);
      }
      return term;
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
