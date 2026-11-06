import {
  DEFAULT_LANGUAGES,
  normalizeLanguageConfig,
  type LanguageConfig,
} from '@mernpress/contracts';
import type { AuthService, ContentService, OptionService } from '@mernpress/cms-core';
import { ContentError } from '@mernpress/cms-core';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { requireAdmin } from '../auth/require-admin.js';
import type { Env } from '../config/env.js';
import { sendRouteError } from './send-error.js';

const postParamSchema = z.object({ id: z.string().uuid() }).strict();
const languageCode = z
  .string()
  .regex(/^[a-z]{2,3}(?:-[a-z]{2})?$/)
  .max(10);
const translationBodySchema = z.object({ language: languageCode }).strict();
const languagesBodySchema = z
  .object({ default: languageCode, enabled: z.array(languageCode).min(1).max(30) })
  .strict();

interface LanguageRouteOptions {
  env: Env;
  auth: AuthService;
  content: ContentService;
  options: OptionService;
}

/**
 * Settings → Languages (default + enabled list) and the editor's translation
 * grouping endpoints. Translations are ordinary posts in the same
 * `translation_group`; nothing is copied across a separate table.
 */
export function registerLanguageRoutes(app: FastifyInstance, options: LanguageRouteOptions): void {
  const { env, auth, content, options: optionService } = options;
  const guard = (request: FastifyRequest, reply: FastifyReply) =>
    requireAdmin(request, reply, { env, auth });

  async function languageConfig(principal: {
    userId: string;
    role: string;
  }): Promise<LanguageConfig> {
    const values = await optionService.getOptions(principal, { group: 'general' });
    return normalizeLanguageConfig(values['site_languages'] ?? DEFAULT_LANGUAGES);
  }

  app.get('/api/admin/languages', async (request, reply) => {
    const ctx = await guard(request, reply);
    if (!ctx) return;
    try {
      return await languageConfig(ctx.principal);
    } catch (error) {
      return sendRouteError(reply, request, error);
    }
  });

  app.put('/api/admin/languages', async (request, reply) => {
    const ctx = await guard(request, reply);
    if (!ctx) return;
    try {
      const body = languagesBodySchema.parse(request.body);
      const config = normalizeLanguageConfig(body);
      if (config.default !== body.default) {
        throw new ContentError('VALIDATION_ERROR', 'The default language must be enabled.', 400);
      }
      await optionService.updateOptions(ctx.principal, {
        group: 'general',
        values: { site_languages: config },
      });
      return config;
    } catch (error) {
      return sendRouteError(reply, request, error);
    }
  });

  app.get('/api/admin/posts/:id/translations', async (request, reply) => {
    const ctx = await guard(request, reply);
    if (!ctx) return;
    try {
      const { id } = postParamSchema.parse(request.params);
      return { items: await content.listTranslations(ctx.principal, id) };
    } catch (error) {
      return sendRouteError(reply, request, error);
    }
  });

  app.post('/api/admin/posts/:id/translations', async (request, reply) => {
    const ctx = await guard(request, reply);
    if (!ctx) return;
    try {
      const { id } = postParamSchema.parse(request.params);
      const body = translationBodySchema.parse(request.body);
      const translation = await content.createTranslation(ctx.principal, id, body.language);
      return reply.code(201).send(translation);
    } catch (error) {
      return sendRouteError(reply, request, error);
    }
  });
}
