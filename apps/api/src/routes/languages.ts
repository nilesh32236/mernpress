import {
  DEFAULT_LANGUAGES,
  DEFAULT_THEME_STRINGS,
  THEME_STRING_KEYS,
  normalizeLanguageConfig,
  normalizeThemeStringOverrides,
  normalizeThemeStringsByLanguage,
  type LanguageConfig,
} from '@mernpress/contracts';
import { validateLanguageMenus, validateMenu } from '@mernpress/cms-core';
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
const themeStringsBodySchema = z
  .object({
    language: languageCode,
    strings: z.record(z.string().max(40), z.string().max(80)),
  })
  .strict();
const languageMenuBodySchema = z
  .object({
    language: languageCode,
    menu: z
      .array(z.object({ label: z.string().max(80), url: z.string().max(2048) }).strict())
      .max(20),
  })
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

  app.get('/api/admin/theme-strings', async (request, reply) => {
    const ctx = await guard(request, reply);
    if (!ctx) return;
    try {
      const values = await optionService.getOptions(ctx.principal, { group: 'appearance' });
      return {
        strings: normalizeThemeStringsByLanguage(values['theme_strings']),
        defaults: DEFAULT_THEME_STRINGS,
        keys: THEME_STRING_KEYS,
      };
    } catch (error) {
      return sendRouteError(reply, request, error);
    }
  });

  app.put('/api/admin/theme-strings', async (request, reply) => {
    const ctx = await guard(request, reply);
    if (!ctx) return;
    try {
      const body = themeStringsBodySchema.parse(request.body);
      const config = await languageConfig(ctx.principal);
      if (!config.enabled.includes(body.language)) {
        throw new ContentError('LANGUAGE_NOT_ENABLED', 'That language is not enabled.', 400);
      }
      const normalized = normalizeThemeStringOverrides(body.strings);
      if (Object.keys(normalized).length !== Object.keys(body.strings).length) {
        throw new ContentError('VALIDATION_ERROR', 'Unknown or empty theme-string keys.', 400);
      }
      const values = await optionService.getOptions(ctx.principal, { group: 'appearance' });
      const map = normalizeThemeStringsByLanguage(values['theme_strings']);
      if (Object.keys(normalized).length === 0) {
        delete map[body.language];
      } else {
        map[body.language] = normalized;
      }
      await optionService.updateOptions(ctx.principal, {
        group: 'appearance',
        values: { theme_strings: map },
      });
      return { strings: map };
    } catch (error) {
      return sendRouteError(reply, request, error);
    }
  });

  app.get('/api/admin/language-menus', async (request, reply) => {
    const ctx = await guard(request, reply);
    if (!ctx) return;
    try {
      const values = await optionService.getOptions(ctx.principal, { group: 'appearance' });
      return {
        menus: validateLanguageMenus(values['customizer_menus']),
        default: (await languageConfig(ctx.principal)).default,
        enabled: (await languageConfig(ctx.principal)).enabled,
      };
    } catch (error) {
      return sendRouteError(reply, request, error);
    }
  });

  app.put('/api/admin/language-menus', async (request, reply) => {
    const ctx = await guard(request, reply);
    if (!ctx) return;
    try {
      const body = languageMenuBodySchema.parse(request.body);
      const config = await languageConfig(ctx.principal);
      if (!config.enabled.includes(body.language)) {
        throw new ContentError('LANGUAGE_NOT_ENABLED', 'That language is not enabled.', 400);
      }
      if (body.language === config.default) {
        throw new ContentError(
          'VALIDATION_ERROR',
          'The default language menu is edited in Appearance → Customize.',
          400,
        );
      }
      const menu = validateMenu(body.menu) ?? [];
      const values = await optionService.getOptions(ctx.principal, { group: 'appearance' });
      const map = validateLanguageMenus(values['customizer_menus']) ?? {};
      if (menu.length === 0) {
        delete map[body.language];
      } else {
        map[body.language] = menu;
      }
      const next = Object.keys(map).length === 0 ? null : map;
      await optionService.updateOptions(ctx.principal, {
        group: 'appearance',
        values: { customizer_menus: next },
      });
      return { menus: next };
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
