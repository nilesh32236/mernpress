import {
  ContentError,
  type ContentService,
  type OptionService,
  type PublicPost,
  type SiteSettings,
  type ThemeService,
} from '@mernpress/cms-core';
import {
  DEFAULT_LANGUAGES,
  languagePath,
  pagePath,
  postPath,
  termPath,
} from '@mernpress/contracts';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { createMemoryRateLimit } from '../security/memory-rate-limit.js';
import {
  publicListQuerySchema,
  publicSlugQuerySchema,
  slugParamSchema,
} from './content-schemas.js';

const previewTokenParamSchema = z.object({ token: z.string().min(1).max(200) }).strict();
const resolveQuerySchema = z
  .object({
    path: z.string().min(1).max(2048).optional(),
    p: z.string().uuid().optional(),
    slug: z.string().min(1).max(200).optional(),
    lang: z
      .string()
      .regex(/^[a-z]{2,3}(?:-[a-z]{2})?$/)
      .max(10)
      .optional(),
  })
  .strict();
const unlockBodySchema = z.object({ password: z.string().min(1).max(200) }).strict();
const termParamSchema = z
  .object({ taxonomy: z.enum(['category', 'tag']), slug: z.string().min(1).max(200) })
  .strict();

interface PublicRouteOptions {
  content: ContentService;
  options: OptionService;
  themes: ThemeService;
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
  const { content, options: optionService, themes } = options;
  // WordPress has no built-in throttle for post passwords; Argon2 verification
  // is expensive, so MERNPress bounds attempts per client and post.
  const unlockLimiter = createMemoryRateLimit({ max: 10, windowMs: 10 * 60 * 1000 });

  /**
   * Add the public URL to a post and its terms. URLs are generated centrally by
   * `@mernpress/contracts` from the configured structure, so the web app never
   * re-implements permalink rules.
   */
  function presentPost(post: PublicPost, settings: SiteSettings) {
    const categorySlug = post.terms.categories[0]?.slug ?? null;
    const languages = settings.languages ?? DEFAULT_LANGUAGES;
    const basePath =
      post.type === 'page'
        ? pagePath(post.slug)
        : postPath(settings.permalinkPattern, {
            id: post.id,
            slug: post.slug,
            publishedAt: post.publishedAt,
            createdAt: post.publishedAt ?? post.updatedAt,
            categorySlug,
          });
    return {
      ...post,
      path: languagePath(languages, post.language, basePath),
      ...(post.translations
        ? {
            translations: post.translations.map((translation) => ({
              ...translation,
              path: languagePath(languages, translation.language, translation.path),
            })),
          }
        : {}),
      terms: {
        categories: post.terms.categories.map((term) => ({
          ...term,
          path: termPath('category', term.slug, { categoryBase: settings.categoryBase }),
        })),
        tags: post.terms.tags.map((term) => ({
          ...term,
          path: termPath('tag', term.slug, { tagBase: settings.tagBase }),
        })),
      },
    };
  }

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
    handle(request, reply, async () => {
      const [settings, theme] = await Promise.all([
        optionService.getPublicSettings(),
        themes.active().catch(() => null),
      ]);
      // Public theme data only: identity, layout variant and design tokens.
      // Theme packages never expose storage paths or server code here.
      return { ...settings, theme };
    }),
  );

  app.post('/api/public/posts/:slug/unlock', async (request, reply) => {
    const parsedParams = slugParamSchema.safeParse(request.params);
    const parsedBody = unlockBodySchema.safeParse(request.body);
    if (!parsedParams.success || !parsedBody.success) {
      return handle(request, reply, async () => {
        throw new ContentError('VALIDATION_ERROR', 'Invalid request', 400);
      });
    }
    const decision = unlockLimiter(`${request.ip}:${parsedParams.data.slug}`);
    if (!decision.allowed) {
      return reply.code(429).send({
        error: {
          code: 'RATE_LIMITED',
          message: 'Too many attempts. Try again later.',
          requestId: request.id,
          retryAfterSeconds: decision.retryAfterSeconds,
        },
      });
    }
    return handle(request, reply, () =>
      content.unlockPublicPost(parsedParams.data.slug, parsedBody.data.password),
    );
  });

  app.get('/api/public/posts', async (request, reply) =>
    handle(request, reply, async () => {
      const parsed = publicListQuerySchema.safeParse(request.query);
      if (!parsed.success) {
        throw new ContentError('VALIDATION_ERROR', validationMessage(parsed.error.issues), 400);
      }
      const [page, settings] = await Promise.all([
        content.listPublic({
          ...parsed.data,
          language: parsed.data.lang,
        }),
        optionService.getPublicSettings(),
      ]);
      return { ...page, items: page.items.map((post) => presentPost(post, settings)) };
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
      const settings = await optionService.getPublicSettings();
      const post = await content.getPublicBySlug(query.data.type, params.data.slug, {
        language: query.data.lang,
        permalinkPattern: settings.permalinkPattern,
      });
      return presentPost(post, settings);
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
      const [post, settings] = await Promise.all([
        content.getPreviewPost(params.data.token),
        optionService.getPublicSettings(),
      ]);
      return presentPost(post, settings);
    });
  });

  /**
   * Resolve a public URL to a post slug for the edge middleware. Returns only
   * the slug and canonical path; it never leaks unpublished content.
   */
  app.get('/api/public/resolve', async (request, reply) =>
    handle(request, reply, async () => {
      const parsed = resolveQuerySchema.safeParse(request.query);
      if (!parsed.success || (!parsed.data.path && !parsed.data.p && !parsed.data.slug)) {
        throw new ContentError('VALIDATION_ERROR', 'Invalid request', 400);
      }
      const settings = await optionService.getPublicSettings();
      const resolved = parsed.data.p
        ? settings.permalinkStructure === 'plain'
          ? await content.resolvePublicId(settings.permalinkPattern, parsed.data.p)
          : null
        : parsed.data.slug
          ? await content.resolvePublicSlug(
              settings.permalinkPattern,
              parsed.data.slug,
              parsed.data.lang,
            )
          : await content.resolvePublicPath(
              settings.permalinkPattern,
              parsed.data.path as string,
              parsed.data.lang,
            );
      if (!resolved) {
        throw new ContentError('NOT_FOUND', 'Not found', 404);
      }
      return resolved;
    }),
  );
}
