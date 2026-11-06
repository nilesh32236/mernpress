import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { AdminPost, PublicPost } from '@mernpress/cms-core';
import {
  ADMIN_ORIGIN,
  ADMIN_PASSWORD,
  ADMIN_USERNAME,
  createTestApp,
  loginAs,
  seedAdmin,
  seedUser,
} from './helpers/auth.js';

interface TranslationShape {
  id: string;
  language: string;
  title: string;
  status: string;
}

describe('multilingual content', () => {
  let app: FastifyInstance;
  let adminHeaders: Record<string, string>;
  let adminCookie: string;

  beforeEach(async () => {
    app = await createTestApp();
    await seedAdmin(app);
    const session = await loginAs(app, ADMIN_USERNAME, ADMIN_PASSWORD);
    adminCookie = session.cookieHeader;
    adminHeaders = {
      origin: ADMIN_ORIGIN,
      cookie: session.cookieHeader,
      'x-csrf-token': session.csrfToken,
      'content-type': 'application/json',
    };
    // Two languages for the translation tests.
    const saved = await putLanguages({ default: 'en', enabled: ['en', 'hi', 'es'] });
    expect(saved.statusCode).toBe(200);
  });

  afterEach(async () => {
    await app.close();
  });

  function putLanguages(payload: unknown, headers = adminHeaders) {
    return app.inject({
      method: 'PUT',
      url: '/api/admin/languages',
      headers,
      payload: payload as Record<string, unknown>,
    });
  }

  function createPost(payload: Record<string, unknown> = {}) {
    return app.inject({
      method: 'POST',
      url: '/api/admin/posts',
      headers: adminHeaders,
      payload: {
        type: 'post',
        title: 'Hello world',
        content: '<!-- wp:paragraph --><p>Body</p><!-- /wp:paragraph -->',
        ...payload,
      },
    });
  }

  async function publish(post: AdminPost): Promise<AdminPost> {
    const response = await app.inject({
      method: 'POST',
      url: `/api/admin/posts/${post.id}/publish`,
      headers: adminHeaders,
      payload: { baseVersion: post.version },
    });
    expect(response.statusCode).toBe(200);
    return response.json() as AdminPost;
  }

  it('stores the default language and validates enabled languages', async () => {
    const listed = await app.inject({
      method: 'GET',
      url: '/api/admin/languages',
      headers: { cookie: adminCookie },
    });
    expect(listed.statusCode).toBe(200);
    expect(listed.json()).toEqual({ default: 'en', enabled: ['en', 'hi', 'es'] });

    const defaults = await createPost();
    expect(defaults.statusCode).toBe(201);
    const post = defaults.json() as AdminPost;
    expect(post.language).toBe('en');
    expect(post.translationGroup).toEqual(expect.any(String));

    const hindi = await createPost({ title: 'नमस्ते दुनिया', language: 'hi' });
    expect(hindi.statusCode).toBe(201);
    expect((hindi.json() as AdminPost).language).toBe('hi');

    const disabled = await createPost({ title: 'Bonjour', language: 'fr' });
    expect(disabled.statusCode).toBe(400);
    expect((disabled.json() as { error: { code: string } }).error.code).toBe(
      'LANGUAGE_NOT_ENABLED',
    );

    const invalid = await createPost({ title: 'Bad', language: 'not a code' });
    expect(invalid.statusCode).toBe(400);

    const updated = await app.inject({
      method: 'PATCH',
      url: `/api/admin/posts/${post.id}`,
      headers: adminHeaders,
      payload: { baseVersion: post.version, language: 'es' },
    });
    expect(updated.statusCode).toBe(200);
    expect((updated.json() as AdminPost).language).toBe('es');
  });

  it('links translations in one group and refuses duplicates', async () => {
    const source = (await createPost({ title: 'Release notes' })).json() as AdminPost;

    const created = await app.inject({
      method: 'POST',
      url: `/api/admin/posts/${source.id}/translations`,
      headers: adminHeaders,
      payload: { language: 'hi' },
    });
    expect(created.statusCode).toBe(201);
    const translation = created.json() as AdminPost;
    expect(translation).toMatchObject({
      language: 'hi',
      status: 'DRAFT',
      translationGroup: source.translationGroup,
      title: 'Release notes',
    });
    expect(translation.slug).toBe('release-notes-hi');

    const duplicate = await app.inject({
      method: 'POST',
      url: `/api/admin/posts/${source.id}/translations`,
      headers: adminHeaders,
      payload: { language: 'hi' },
    });
    expect(duplicate.statusCode).toBe(409);
    expect((duplicate.json() as { error: { code: string } }).error.code).toBe('TRANSLATION_EXISTS');

    const sameLanguage = await app.inject({
      method: 'POST',
      url: `/api/admin/posts/${source.id}/translations`,
      headers: adminHeaders,
      payload: { language: 'en' },
    });
    expect(sameLanguage.statusCode).toBe(400);

    const listed = await app.inject({
      method: 'GET',
      url: `/api/admin/posts/${source.id}/translations`,
      headers: { cookie: adminCookie },
    });
    expect(listed.statusCode).toBe(200);
    const items = (listed.json() as { items: TranslationShape[] }).items;
    expect(items.map((item) => item.language)).toEqual(['en', 'hi']);
  });

  it('serves language-prefixed URLs, hreflang data and default-language archives', async () => {
    const english = await publish((await createPost({ title: 'Launch day' })).json() as AdminPost);
    const created = await app.inject({
      method: 'POST',
      url: `/api/admin/posts/${english.id}/translations`,
      headers: adminHeaders,
      payload: { language: 'hi' },
    });
    expect(created.statusCode).toBe(201);
    const hindiDraft = created.json() as AdminPost;
    // Translations copy the body; publish the variant directly so the public
    // surface has both languages.
    const hindi = await publish(
      (
        await app.inject({
          method: 'PATCH',
          url: `/api/admin/posts/${hindiDraft.id}`,
          headers: adminHeaders,
          payload: { baseVersion: hindiDraft.version, title: 'लॉन्च दिवस' },
        })
      ).json() as AdminPost,
    );

    const englishPublic = await app.inject({
      method: 'GET',
      url: `/api/public/posts/${english.slug}?type=post`,
    });
    expect(englishPublic.statusCode).toBe(200);
    const englishBody = englishPublic.json() as PublicPost & {
      path: string;
      translations: Array<{ language: string; path: string }>;
    };
    expect(englishBody.language).toBe('en');
    expect(englishBody.path).toBe(`/posts/${english.slug}`);
    expect(englishBody.translations).toEqual([
      expect.objectContaining({ language: 'hi', path: `/hi/posts/${hindi.slug}` }),
    ]);

    const hindiPublic = await app.inject({
      method: 'GET',
      url: `/api/public/posts/${hindi.slug}?type=post&lang=hi`,
    });
    expect(hindiPublic.statusCode).toBe(200);
    const hindiBody = hindiPublic.json() as PublicPost & { path: string };
    expect(hindiBody.language).toBe('hi');
    expect(hindiBody.path).toBe(`/hi/posts/${hindi.slug}`);

    // The default-language slug does not resolve in another language.
    const wrongLanguage = await app.inject({
      method: 'GET',
      url: `/api/public/posts/${english.slug}?type=post&lang=hi`,
    });
    expect(wrongLanguage.statusCode).toBe(404);

    const resolved = await app.inject({
      method: 'GET',
      url: `/api/public/resolve?path=${encodeURIComponent(`/posts/${hindi.slug}`)}&lang=hi`,
    });
    expect(resolved.statusCode).toBe(200);
    expect(resolved.json()).toEqual({
      slug: hindi.slug,
      canonicalPath: `/posts/${hindi.slug}`,
    });

    const list = await app.inject({ method: 'GET', url: '/api/public/posts?type=post' });
    const listBody = list.json() as { items: Array<{ id: string }> };
    expect(listBody.items.map((item) => item.id)).not.toContain(hindi.id);
    expect(listBody.items.map((item) => item.id)).toContain(english.id);
  });

  it('rejects non-administrators and invalid language settings', async () => {
    await seedUser(app, {
      username: 'lang-editor',
      password: 'Editor-pass-2026!',
      role: 'editor',
    });
    const editor = await loginAs(app, 'lang-editor', 'Editor-pass-2026!');
    const editorHeaders = {
      origin: ADMIN_ORIGIN,
      cookie: editor.cookieHeader,
      'x-csrf-token': editor.csrfToken,
      'content-type': 'application/json',
    };
    expect((await putLanguages({ default: 'en', enabled: ['en'] }, editorHeaders)).statusCode).toBe(
      403,
    );
    // Reading the list is allowed for signed-in editors; changing it is not.
    const editorRead = await app.inject({
      method: 'GET',
      url: '/api/admin/languages',
      headers: { cookie: editor.cookieHeader },
    });
    expect(editorRead.statusCode).toBe(200);
    expect(editorRead.json()).toEqual({ default: 'en', enabled: ['en', 'hi', 'es'] });

    expect((await putLanguages({ default: 'en', enabled: ['en', 'HI'] })).statusCode).toBe(400);
    expect((await putLanguages({ default: 'en', enabled: [] })).statusCode).toBe(400);
    expect((await putLanguages({ default: 'en', enabled: ['en', 'bad code'] })).statusCode).toBe(
      400,
    );
    const anonymous = await app.inject({ method: 'GET', url: '/api/admin/languages' });
    expect(anonymous.statusCode).toBe(401);
  });
});
